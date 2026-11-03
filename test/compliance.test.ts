import { describe, it, expect, beforeEach } from 'vitest';
import { MockComplianceAdapter } from '../src/shared/adapters/mock/mockComplianceAdapter';
// test imports

describe('Compliance & Legal Layer (Milestone B15 & Frontend Integration)', () => {
  let adapter: MockComplianceAdapter;

  beforeEach(() => {
    adapter = new MockComplianceAdapter();
  });

  describe('Seeded Rule Packs & Domains', () => {
    it('seeds all 9 Azerbaijani compliance domains', async () => {
      const packs = await adapter.getRulePacks();
      expect(packs.length).toBeGreaterThanOrEqual(9);

      const domains = packs.map((p) => p.domain);
      expect(domains).toContain('vat');
      expect(domains).toContain('fiscal');
      expect(domains).toContain('payroll_tax');
      expect(domains).toContain('social_insurance');
      expect(domains).toContain('work_time');
      expect(domains).toContain('leave');
      expect(domains).toContain('consumer_rights');
      expect(domains).toContain('personal_data');
      expect(domains).toContain('retention');
    });

    it('marks all seeded rules with AZ jurisdiction, DEMO label, and UNVERIFIED/DISPUTED status', async () => {
      const packs = await adapter.getRulePacks();
      for (const pack of packs) {
        expect(pack.jurisdiction).toBe('AZ');
        expect(pack.isDemo).toBe(true);
        expect(['UNVERIFIED', 'DISPUTED']).toContain(pack.status);
        expect(pack.legalReference).toBeTruthy();
        expect((pack.versions || []).length).toBeGreaterThanOrEqual(1);
      }
    });

    it('returns status summary with domain counts', async () => {
      const summary = await adapter.getStatusSummary();
      expect(summary.isDemo).toBe(true);
      expect((summary as any).totalRulePacks).toBeGreaterThanOrEqual(9);
      expect((summary as any).unverifiedCount).toBeGreaterThan(0);
      expect(summary.domains.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('Two-Person Rule & Verification Workflow', () => {
    it('prohibits self-verification (verifier cannot be the author/editor)', async () => {
      const packs = await adapter.getRulePacks();
      const vatPack = packs.find((p) => p.domain === 'vat' || (p.domain as any) === 'tax_vat')!;
      const author = (vatPack.versions![vatPack.versions!.length - 1] as any).author;

      await expect(
        adapter.verifyPack(vatPack.id, {
          verifierName: author, // Same author
          verifierRole: 'ACCOUNTANT',
          evidenceNotes: 'AR Vergi Məcəlləsinin 2026-cı il dəyişiklikləri yoxlanıldı.',
        })
      ).rejects.toThrow(/İki şəxs qaydası/);
    });

    it('rejects verification if evidence notes are shorter than 20 characters', async () => {
      const packs = await adapter.getRulePacks();
      const vatPack = packs.find((p) => p.domain === 'vat' || (p.domain as any) === 'tax_vat')!;

      await expect(
        adapter.verifyPack(vatPack.id, {
          verifierName: 'Müstəqil Mühasib',
          verifierRole: 'ACCOUNTANT',
          evidenceNotes: 'Qısa qeyd', // < 20 chars
        })
      ).rejects.toThrow(/20 simvol/);
    });

    it('successfully verifies pack when verifier is different and evidence is sufficient', async () => {
      const packs = await adapter.getRulePacks();
      const vatPack = packs.find((p) => p.domain === 'vat' || (p.domain as any) === 'tax_vat')!;

      const updated = await adapter.verifyPack(vatPack.id, {
        verifierName: 'Kamran Həsənov (Müstəqil Auditor)',
        verifierRole: 'ACCOUNTANT',
        evidenceNotes: 'AR Vergi Məcəlləsinin 152 və 173-cü maddələri üzrə ƏDV dərəcəsi və qaydaları tam yoxlanıldı.',
      });

      expect(updated.status).toBe('VERIFIED');
      expect(updated.verifiedBy?.name).toBe('Kamran Həsənov (Müstəqil Auditor)');
      expect(updated.verifiedBy?.role).toBe('ACCOUNTANT');
      expect(updated.verifiedAt).toBeTruthy();
    });

    it('activates verified pack with Baku midnight boundary timestamp', async () => {
      const packs = await adapter.getRulePacks();
      const vatPack = packs.find((p) => p.domain === 'vat' || (p.domain as any) === 'tax_vat')!;

      // Verify first
      await adapter.verifyPack(vatPack.id, {
        verifierName: 'Nigar Rüstəmova',
        verifierRole: 'ACCOUNTANT',
        evidenceNotes: 'AR Vergi Məcəlləsi 2026 rəsmi mətni ilə tutuşduruldu və təsdiqləndi.',
      });

      // Activate
      const activated = await adapter.activatePack(vatPack.id, {
        effectiveFrom: '2026-05-01T00:00:00+04:00',
        
      });

      expect(activated.status).toBe('VERIFIED');
      expect(activated.effectiveFrom).toContain('+04:00');
    });
  });

  describe('Feature Gates & Production Blocking', () => {
    it('allows unverified packs in non-production with warning', async () => {
      adapter.setProductionMode(false);
      const gate = await adapter.checkFeatureGate('payroll_finalization');
      expect(gate.allowed).toBe(true);
      expect(gate.warning).toBeDefined();
    });

    it('blocks payroll finalization in production when tax/social packs are UNVERIFIED', async () => {
      adapter.setProductionMode(true);
      const gate = await adapter.checkFeatureGate('payroll_finalization');
      expect(gate.allowed).toBe(false);
      expect(gate.blockingDomain).toBeTruthy();
      expect(gate.requiredRole).toBeDefined();
    });

    it('blocks fiscal receipts in production when fiscal pack is UNVERIFIED', async () => {
      adapter.setProductionMode(true);
      const gate = await adapter.checkFeatureGate('fiscal_receipts');
      expect(gate.allowed).toBe(false);
      expect(gate.blockingDomain).toBe('fiscal');
    });
  });

  describe('Turnover Monitor (0.5 Cashless Coefficient)', () => {
    it('applies 0.5 discount coefficient to cashless sales toward 200,000 AZN threshold', async () => {
      const monitor = await adapter.getTurnoverMonitor();
      expect(monitor.threshold).toBe(200000);
      expect(monitor.cashlessCoefficient || monitor.coefficientApplied).toBe(0.5);

      // Verify formula: adjusted = cash + (cashless * 0.5)
      const coeff = monitor.cashlessCoefficient || monitor.coefficientApplied;
      const expectedAdjusted = monitor.cashTurnover + monitor.cashlessTurnover * coeff;
      expect(monitor.adjustedTurnover).toBeCloseTo(expectedAdjusted, 1);

      // Percentage calculation
      const expectedPercentage = Math.round((expectedAdjusted / monitor.threshold) * 100);
      const perc = monitor.percentage ?? monitor.percentOfThreshold;
      expect(perc).toBeCloseTo(expectedPercentage, 0);
    });

    it('triggers warning alert when threshold exceeds 80%', async () => {
      const monitor = await adapter.getTurnoverMonitor();
      const perc = monitor.percentage ?? monitor.percentOfThreshold;
      if (perc >= 80 && perc < 95) {
        expect(monitor.alertLevel).toBe('WARNING_80');
      } else if (perc >= 95 && perc < 100) {
        expect(monitor.alertLevel).toBe('CRITICAL_95');
      } else if (perc >= 100) {
        expect(monitor.alertLevel).toBe('EXCEEDED');
      } else {
        expect(monitor.alertLevel).toBe('NORMAL');
      }
    });
  });

  describe('Privacy, Consents, and Audit Inspection Pack', () => {
    it('records consent with separate purposes and audit reference', async () => {
      const consent = await adapter.recordConsent({
        subjectType: 'CUSTOMER',
        subjectId: 'CUST-009',
        purposes: ['marketing', 'loyalty', 'retention'],
        method: 'OTP',
        evidenceReference: 'OTP-4921',
      });

      expect(consent.subjectId).toBe('CUST-009');
      expect(consent.purposes).toEqual(['marketing', 'loyalty', 'retention']);
      expect((consent as any).auditHash).toBeTruthy();
      expect((consent as any).recordedAt).toBeTruthy();
    });

    it('generates an inspection pack with SHA-256 hash', async () => {
      const pack = await adapter.generateInspectionPack();
      expect(pack.packId).toBeTruthy();
      expect(pack.integrityHash).toMatch(/^[a-f0-9]{64}$/);
      expect(pack.manifest.rulesCount).toBeGreaterThanOrEqual(9);
      expect(pack.manifest.generatedBy).toBe('BRAND_HOUSE_COMPLIANCE_ENGINE');
    });
  });
});
