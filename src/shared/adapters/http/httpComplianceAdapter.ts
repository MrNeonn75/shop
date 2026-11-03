import { httpClient } from '../../api/httpClient';
import { ComplianceRepository } from '../types';
import { MockComplianceAdapter } from '../mock/mockComplianceAdapter';
import {
  ComplianceStatusSummary,
  ComplianceBannerResponse,
  LegalRule,
  RulePack,
  RulePackVersion,
  VersionDiff,
  Obligation,
  OpenLegalQuestion,
  FiscalStatus,
  TurnoverMonitorData,
  DataProcessingRegisterEntry,
  TransferRegisterEntry,
  PersonalDataSystemRegistration,
  DsarRequest,
  RetentionRuleItem,
  LegalHoldItem,
  ConsentRecord,
  InspectionPackResponse,
  ProductionCalendarYear,
  ProposeChangeRequest,
  VerifyPackRequest,
  ActivatePackRequest,
  VerifierRole,
} from '../../../features/compliance/types';

export class HttpComplianceAdapter implements ComplianceRepository {
  private fallback = new MockComplianceAdapter();

  async checkFeatureGate(feature: string) {
    try {
      const res = await httpClient.get<any>(`/compliance/gates/${feature}`);
      return res.data;
    } catch {
      return this.fallback.checkFeatureGate(feature);
    }
  }

  async getStatusSummary(): Promise<ComplianceStatusSummary> {
    try {
      const res = await httpClient.get<ComplianceStatusSummary>('/compliance/summary');
      return res.data;
    } catch {
      return this.fallback.getStatusSummary();
    }
  }

  async getBanner(): Promise<ComplianceBannerResponse> {
    try {
      const res = await httpClient.get<ComplianceBannerResponse>('/compliance/banner');
      return res.data;
    } catch {
      return this.fallback.getBanner();
    }
  }

  async getBannerStatus(): Promise<ComplianceBannerResponse> {
    return this.getBanner();
  }

  async getRules(params?: { domain?: string; status?: string; ruleKey?: string }): Promise<LegalRule[]> {
    try {
      const res = await httpClient.get<LegalRule[]>('/compliance/rules', { params });
      return res.data;
    } catch {
      return this.fallback.getRules(params);
    }
  }

  async getRuleById(id: string): Promise<LegalRule | null> {
    try {
      const res = await httpClient.get<LegalRule>(`/compliance/rules/${id}`);
      return res.data;
    } catch {
      return this.fallback.getRuleById(id);
    }
  }

  async getRuleHistory(id: string): Promise<LegalRule[]> {
    try {
      const res = await httpClient.get<LegalRule[]>(`/compliance/rules/${id}/history`);
      return res.data;
    } catch {
      return this.fallback.getRuleHistory(id);
    }
  }

  async getPacks(): Promise<RulePack[]> {
    try {
      const res = await httpClient.get<RulePack[]>('/compliance/packs');
      return res.data;
    } catch {
      return this.fallback.getPacks();
    }
  }

  async getRulePacks(): Promise<RulePack[]> {
    return this.getPacks();
  }

  async proposePackVersion(packId: string, req: ProposeChangeRequest): Promise<RulePackVersion> {
    try {
      const res = await httpClient.post<RulePackVersion>(`/compliance/packs/${packId}/propose`, req);
      return res.data;
    } catch {
      return this.fallback.proposePackVersion(packId, req);
    }
  }

  async verifyPackVersion(versionId: string, req: VerifyPackRequest): Promise<RulePackVersion> {
    try {
      const res = await httpClient.post<RulePackVersion>(`/compliance/pack-versions/${versionId}/verify`, req);
      return res.data;
    } catch {
      return this.fallback.verifyPackVersion(versionId, req);
    }
  }

  async verifyPack(packId: string, req: VerifyPackRequest): Promise<any> {
    return this.fallback.verifyPack(packId, req);
  }

  async rejectPackVersion(
    versionId: string,
    req: { verifierName: string; verifierRole: VerifierRole; evidenceNotes: string }
  ): Promise<RulePackVersion> {
    try {
      const res = await httpClient.post<RulePackVersion>(`/compliance/pack-versions/${versionId}/reject`, req);
      return res.data;
    } catch {
      return this.fallback.rejectPackVersion(versionId, req);
    }
  }

  async activatePackVersion(versionId: string, req: ActivatePackRequest): Promise<RulePackVersion> {
    try {
      const res = await httpClient.post<RulePackVersion>(`/compliance/pack-versions/${versionId}/activate`, req);
      return res.data;
    } catch {
      return this.fallback.activatePackVersion(versionId, req);
    }
  }

  async activatePack(packId: string, req: ActivatePackRequest): Promise<any> {
    return this.fallback.activatePack(packId, req);
  }

  async proposeChange(packId: string, req: any): Promise<any> {
    return this.fallback.proposeChange(packId, req);
  }

  async completeObligation(id: string, notes?: string): Promise<any> {
    return this.fallback.completeObligation(id, notes);
  }

  async diffPackVersions(versionAId: string, versionBId: string): Promise<VersionDiff> {
    try {
      const res = await httpClient.get<VersionDiff>('/compliance/pack-versions/diff', {
        params: { versionAId, versionBId },
      });
      return res.data;
    } catch {
      return this.fallback.diffPackVersions(versionAId, versionBId);
    }
  }

  async exportRegister(format: 'csv' | 'pdf'): Promise<{ filename: string; body: string; disclaimer: string }> {
    try {
      const res = await httpClient.get<{ filename: string; body: string; disclaimer: string }>(
        `/compliance/export?format=${format}`
      );
      return res.data;
    } catch {
      return this.fallback.exportRegister(format);
    }
  }

  async getObligations(status?: string): Promise<Obligation[]> {
    try {
      const res = await httpClient.get<Obligation[]>('/compliance/obligations', { params: { status } });
      return res.data;
    } catch {
      return this.fallback.getObligations(status);
    }
  }

  async createObligation(req: Partial<Obligation>): Promise<Obligation> {
    try {
      const res = await httpClient.post<Obligation>('/compliance/obligations', req);
      return res.data;
    } catch {
      return this.fallback.createObligation(req);
    }
  }

  async updateObligation(id: string, req: Partial<Obligation>): Promise<Obligation> {
    try {
      const res = await httpClient.put<Obligation>(`/compliance/obligations/${id}`, req);
      return res.data;
    } catch {
      return this.fallback.updateObligation(id, req);
    }
  }

  async deleteObligation(id: string): Promise<boolean> {
    try {
      await httpClient.delete(`/compliance/obligations/${id}`);
      return true;
    } catch {
      return this.fallback.deleteObligation(id);
    }
  }

  async getOpenLegalQuestions(): Promise<OpenLegalQuestion[]> {
    try {
      const res = await httpClient.get<OpenLegalQuestion[]>('/compliance/questions');
      return res.data;
    } catch {
      return this.fallback.getOpenLegalQuestions();
    }
  }

  async updateLegalQuestion(
    id: number,
    req: { assignee?: string; notes?: string; status?: 'PENDING_LEGAL' | 'RESOLVED' }
  ): Promise<OpenLegalQuestion> {
    try {
      const res = await httpClient.put<OpenLegalQuestion>(`/compliance/questions/${id}`, req);
      return res.data;
    } catch {
      return this.fallback.updateLegalQuestion(id, req);
    }
  }

  async getFiscalStatus(): Promise<FiscalStatus> {
    try {
      const res = await httpClient.get<FiscalStatus>('/compliance/fiscal/status');
      return res.data;
    } catch {
      return this.fallback.getFiscalStatus();
    }
  }

  async reconcileFiscal(): Promise<{ reconciled: boolean; matchedCount: number; driftFound: boolean; details: string }> {
    try {
      const res = await httpClient.post<{ reconciled: boolean; matchedCount: number; driftFound: boolean; details: string }>(
        '/compliance/fiscal/reconcile'
      );
      return res.data;
    } catch {
      return this.fallback.reconcileFiscal();
    }
  }

  async getTurnoverMonitor(): Promise<TurnoverMonitorData> {
    try {
      const res = await httpClient.get<TurnoverMonitorData>('/compliance/turnover/monitor');
      return res.data;
    } catch {
      return this.fallback.getTurnoverMonitor();
    }
  }

  async getDataProcessingRegister(): Promise<DataProcessingRegisterEntry[]> {
    try {
      const res = await httpClient.get<DataProcessingRegisterEntry[]>('/compliance/privacy/processing-register');
      return res.data;
    } catch {
      return this.fallback.getDataProcessingRegister();
    }
  }

  async getTransferRegister(): Promise<TransferRegisterEntry[]> {
    try {
      const res = await httpClient.get<TransferRegisterEntry[]>('/compliance/privacy/transfer-register');
      return res.data;
    } catch {
      return this.fallback.getTransferRegister();
    }
  }

  async updateTransferRegister(id: string, req: Partial<TransferRegisterEntry>): Promise<TransferRegisterEntry> {
    try {
      const res = await httpClient.put<TransferRegisterEntry>(`/compliance/privacy/transfer-register/${id}`, req);
      return res.data;
    } catch {
      return this.fallback.updateTransferRegister(id, req);
    }
  }

  async getPersonalDataRegistration(): Promise<PersonalDataSystemRegistration> {
    try {
      const res = await httpClient.get<PersonalDataSystemRegistration>('/compliance/privacy/registration');
      return res.data;
    } catch {
      return this.fallback.getPersonalDataRegistration();
    }
  }

  async getPersonalDataSystemRegistration(): Promise<PersonalDataSystemRegistration> {
    return this.getPersonalDataRegistration();
  }

  async getDsarRequests(): Promise<DsarRequest[]> {
    try {
      const res = await httpClient.get<DsarRequest[]>('/compliance/privacy/dsar');
      return res.data;
    } catch {
      return this.fallback.getDsarRequests();
    }
  }

  async updateDsarRequest(id: string, req: Partial<DsarRequest>): Promise<DsarRequest> {
    try {
      const res = await httpClient.put<DsarRequest>(`/compliance/privacy/dsar/${id}`, req);
      return res.data;
    } catch {
      return this.fallback.updateDsarRequest(id, req);
    }
  }

  async getRetentionRules(): Promise<RetentionRuleItem[]> {
    try {
      const res = await httpClient.get<RetentionRuleItem[]>('/compliance/privacy/retention-rules');
      return res.data;
    } catch {
      return this.fallback.getRetentionRules();
    }
  }

  async getLegalHolds(): Promise<LegalHoldItem[]> {
    try {
      const res = await httpClient.get<LegalHoldItem[]>('/compliance/privacy/legal-holds');
      return res.data;
    } catch {
      return this.fallback.getLegalHolds();
    }
  }

  async createLegalHold(req: { entityType: string; entityId: string; reason: string; heldByName: string }): Promise<LegalHoldItem> {
    try {
      const res = await httpClient.post<LegalHoldItem>('/compliance/privacy/legal-holds', req);
      return res.data;
    } catch {
      return this.fallback.createLegalHold(req);
    }
  }

  async releaseLegalHold(id: string, releasedByName: string): Promise<LegalHoldItem> {
    try {
      const res = await httpClient.post<LegalHoldItem>(`/compliance/privacy/legal-holds/${id}/release`, { releasedByName });
      return res.data;
    } catch {
      return this.fallback.releaseLegalHold(id, releasedByName);
    }
  }

  async getConsentRecords(subjectId?: string): Promise<ConsentRecord[]> {
    try {
      const res = await httpClient.get<ConsentRecord[]>('/compliance/privacy/consents', { params: { subjectId } });
      return res.data;
    } catch {
      return this.fallback.getConsentRecords(subjectId);
    }
  }

  async saveConsentRecord(record: Partial<ConsentRecord>): Promise<ConsentRecord> {
    try {
      const res = await httpClient.post<ConsentRecord>('/compliance/privacy/consents', record);
      return res.data;
    } catch {
      return this.fallback.saveConsentRecord(record);
    }
  }

  async recordConsent(record: any): Promise<ConsentRecord> {
    return this.fallback.recordConsent(record);
  }

  async generateInspectionPack(periodFrom?: string, periodTo?: string): Promise<InspectionPackResponse> {
    try {
      const res = await httpClient.post<InspectionPackResponse>('/compliance/privacy/inspection-pack', { periodFrom, periodTo });
      return res.data;
    } catch {
      return this.fallback.generateInspectionPack(periodFrom, periodTo);
    }
  }

  async getProductionCalendar(year: number): Promise<ProductionCalendarYear> {
    try {
      const res = await httpClient.get<ProductionCalendarYear>(`/compliance/calendar/${year}`);
      return res.data;
    } catch {
      return this.fallback.getProductionCalendar(year);
    }
  }

  async importProductionCalendar(data: Partial<ProductionCalendarYear>): Promise<ProductionCalendarYear> {
    try {
      const res = await httpClient.post<ProductionCalendarYear>('/compliance/calendar/import', data);
      return res.data;
    } catch {
      return this.fallback.importProductionCalendar(data);
    }
  }
}
