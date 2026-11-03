import React, { useEffect, useState } from 'react';
import {
  PersonalDataSystemRegistration,
  DataProcessingRegisterEntry,
  TransferRegisterEntry,
  DsarRequest,
  RetentionRuleItem,
  LegalHoldItem,
  InspectionPackResponse,
} from '../types';
import { complianceRepository } from '../../../shared/adapters';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import {
  Shield,
  Lock,
  Globe,
  FileCheck,
  Clock,
  Download,
  Building,
  AlertTriangle,
  FolderLock,
  } from 'lucide-react';

export const PrivacyCenterPage: React.FC = () => {
  const [systemReg, setSystemReg] = useState<PersonalDataSystemRegistration | null>(null);
  const [processingEntries, setProcessingEntries] = useState<DataProcessingRegisterEntry[]>([]);
  const [transfers, setTransfers] = useState<TransferRegisterEntry[]>([]);
  const [dsarRequests, setDsarRequests] = useState<DsarRequest[]>([]);
  const [retentionRules, setRetentionRules] = useState<RetentionRuleItem[]>([]);
  const [legalHolds, setLegalHolds] = useState<LegalHoldItem[]>([]);
  const [, setLoading] = useState(true);

  // Inspection pack modal
  const [inspectionPack, setInspectionPack] = useState<InspectionPackResponse | null>(null);
  const [isPackModalOpen, setIsPackModalOpen] = useState(false);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reg, proc, trans, dsar, ret, holds] = await Promise.all([
        complianceRepository.getPersonalDataSystemRegistration(),
        complianceRepository.getDataProcessingRegister(),
        complianceRepository.getTransferRegister(),
        complianceRepository.getDsarRequests(),
        complianceRepository.getRetentionRules(),
        complianceRepository.getLegalHolds(),
      ]);
      setSystemReg(reg);
      setProcessingEntries(proc);
      setTransfers(trans);
      setDsarRequests(dsar);
      setRetentionRules(ret);
      setLegalHolds(holds);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGeneratePack = async () => {
    try {
      setIsGeneratingPack(true);
      const pack = await complianceRepository.generateInspectionPack('2026-01-01', '2026-12-31');
      setInspectionPack(pack);
      setIsPackModalOpen(true);
    } finally {
      setIsGeneratingPack(false);
    }
  };

  const handleDownloadPackJson = () => {
    if (!inspectionPack) return;
    const jsonStr = JSON.stringify(inspectionPack, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inspection_pack_${inspectionPack.packId}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Lock className="h-7 w-7 text-indigo-400" />
            <h1 className="text-2xl font-bold text-zinc-100">
              Fərdi Məlumatlar və Məxfilik Mərkəzi
            </h1>
            {(systemReg as any)?.isDemo && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-xs font-mono font-semibold">
                DEMO
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            «Fərdi məlumatlar haqqında» AR Qanununa uyğun qeydiyyat, emal, transsərhəd ötürülmə və vətəndaş müraciətləri reyestri
          </p>
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={handleGeneratePack}
          disabled={isGeneratingPack}
        >
          <FolderLock className="h-4 w-4 mr-1.5" />
          {isGeneratingPack ? 'Yaradılır...' : 'Dövlət Yoxlama Paketi Yarat (SHA-256)'}
        </Button>
      </div>

      {/* Section 1: State Registration Status */}
      {systemReg && (
        <Card className="p-5 bg-zinc-900 border-zinc-800 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Building className="h-5 w-5 text-indigo-400" />
              <div>
                <h3 className="font-semibold text-zinc-100 text-sm">
                  Fərdi Məlumat İnformasiya Sistemlərinin Dövlət Qeydiyyatı
                </h3>
                <div className="text-xs text-zinc-400">
                  Rəqəmsal İnkişaf və Nəqliyyat Nazirliyi (RİNN) reyestri
                </div>
              </div>
            </div>
            <Badge
              variant={
                systemReg.status === 'REGISTERED'
                  ? 'success'
                  : (systemReg.status as any) === 'REGISTRATION_PENDING' || (systemReg.status as any) === 'PENDING'
                  ? 'warning'
                  : 'neutral'
              }
            >
              {systemReg.status === 'REGISTERED'
                ? 'Dövlət Qeydiyyatından Keçib'
                : (systemReg.status as any) === 'REGISTRATION_PENDING' || (systemReg.status as any) === 'PENDING'
                ? 'Qeydiyyat Gözlənilir'
                : 'İstisna Rejimi'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-zinc-800">
            <div>
              <span className="text-zinc-500">Qeydiyyat Şəhadətnaməsi:</span>
              <div className="font-mono text-zinc-200 mt-0.5">
                {(systemReg as any).referenceNumber || (systemReg as any).registrationNumber || 'Verilməyib'}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Qeydiyyat Tarixi:</span>
              <div className="font-mono text-zinc-200 mt-0.5">
                {(systemReg as any).registeredAt || (systemReg as any).registrationDate
                  ? new Date((systemReg as any).registeredAt || (systemReg as any).registrationDate).toLocaleDateString('az-AZ')
                  : 'Müraciət mərhələsindədir'}
              </div>
            </div>
            <div>
              <span className="text-zinc-500">Məsul Şəxs / DPO:</span>
              <div className="text-zinc-200 mt-0.5">{(systemReg as any).authority || (systemReg as any).officerInCharge || 'RİNN Dövlət Reyestri'}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Section 2: Data Processing Register */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-indigo-400" />
            Məlumatların Emalı Reyestri (Data Inventory)
          </h2>
          <span className="text-xs text-zinc-500">{processingEntries.length} emal fəaliyyəti</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950/80 text-zinc-400 font-semibold border-b border-zinc-800 uppercase">
              <tr>
                <th className="p-3">Fəaliyyət / Sistem</th>
                <th className="p-3">Kateqoriyalar</th>
                <th className="p-3">Emal Məqsədi</th>
                <th className="p-3">Hüquqi Əsas</th>
                <th className="p-3">Saxlama Yeri</th>
                <th className="p-3">Müddət</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-medium">
              {processingEntries.map((pe) => (
                <tr key={pe.id} className="hover:bg-zinc-800/30">
                  <td className="p-3 font-semibold text-zinc-100">{(pe as any).activity || pe.systemModule}</td>
                  <td className="p-3 text-zinc-400">
                    {((pe as any).categories || pe.dataCategories || []).map((c: string) => (
                      <span key={c} className="inline-block bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] mr-1 mb-1">
                        {c}
                      </span>
                    ))}
                  </td>
                  <td className="p-3 text-zinc-300 max-w-xs">{pe.purpose}</td>
                  <td className="p-3">
                    <Badge variant="neutral">{pe.legalBasis}</Badge>
                  </td>
                  <td className="p-3 font-mono text-zinc-400">{pe.storageLocation}</td>
                  <td className="p-3 text-zinc-300 font-mono">{(pe as any).retentionPeriod || pe.retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Cross-border Transfers & Section 4: DSAR Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cross-border Transfers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-400" />
              Transsərhəd Ötürülmə Reyestri
            </h2>
            <span className="text-xs text-zinc-500">{transfers.length} inteqrasiya</span>
          </div>

          <div className="space-y-3">
            {transfers.map((tr) => (
              <Card key={tr.id} className="p-3.5 bg-zinc-900 border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-zinc-100 text-xs">{(tr as any).recipient || tr.processorName}</div>
                  <Badge variant={(tr.status as any) === 'VERIFIED' || (tr.status as any) === 'AUTHORIZED' ? 'success' : 'warning'}>
                    {tr.status}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-400 flex items-center justify-between">
                  <span>Ölkə: <strong className="text-zinc-200">{(tr as any).destinationCountry || tr.country}</strong></span>
                  <span>Mühafizə: <span className="font-mono text-indigo-400">{(tr as any).safeguardMechanism || tr.safeguards}</span></span>
                </div>
                <div className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-800">
                  {(tr as any).description || tr.notes || 'Transsərhəd ötürmə qeydi'}
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* DSAR Requests */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              Vətəndaş Müraciətləri Növbəsi (DSAR)
            </h2>
            <span className="text-xs text-zinc-500">{dsarRequests.length} sorğu</span>
          </div>

          <div className="space-y-3">
            {dsarRequests.map((req) => (
              <Card key={req.id} className="p-3.5 bg-zinc-900 border-zinc-800 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-zinc-100 text-xs">
                      {req.subjectName} ({req.requestType})
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Daxil olma: {new Date((req as any).receivedAt || req.createdAt).toLocaleDateString('az-AZ')}
                    </div>
                  </div>
                  <Badge
                    variant={
                      req.status === 'COMPLETED'
                        ? 'success'
                        : req.status === 'REJECTED'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {req.status}
                  </Badge>
                </div>

                <div className="text-xs text-zinc-300">
                  {(req as any).details || req.outcomeNotes || 'Fərdi məlumat müraciəti'}
                </div>

                {(req as any).retentionConflict && (
                  <div className="p-2 bg-amber-950/60 border border-amber-800/60 rounded text-[11px] text-amber-200 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Qanuni ziddiyyət:</strong> {(req as any).retentionConflict}
                    </span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Section 5: Retention Rules and Legal Holds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-400" />
            Qanuni Saxlama Müddətləri (Retention)
          </h2>
          <div className="space-y-2">
            {retentionRules.map((rr) => (
              <div
                key={rr.id}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-xs flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-zinc-200">{(rr as any).dataType || rr.entityType}</div>
                  <div className="text-zinc-500 mt-0.5">{rr.legalReference}</div>
                </div>
                <div className="font-mono font-semibold text-indigo-400 text-right">
                  {rr.retentionYears} il
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            <Lock className="h-4 w-4 text-rose-400" />
            Aktiv Hüquqi Saxlama Rejimi (Legal Holds)
          </h2>
          <div className="space-y-2">
            {legalHolds.map((lh) => (
              <div
                key={lh.id}
                className="p-3 bg-rose-950/20 border border-rose-900/50 rounded-lg text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-rose-200">{(lh as any).scope || lh.entityType}</span>
                  <Badge variant="danger">Aktiv Hold</Badge>
                </div>
                <div className="text-zinc-300">{lh.reason}</div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  Əmr verən: {(lh as any).orderedBy || lh.heldByName} | Tarix: {new Date((lh as any).appliedAt || lh.heldAt).toLocaleDateString('az-AZ')}
                </div>
              </div>
            ))}
            {legalHolds.length === 0 && (
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-center text-xs text-zinc-500">
                Hal-hazırda aktiv məhkəmə və ya vergi araşdırması üzrə hüquqi saxlama rejimi yoxdur.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inspection Pack Modal */}
      {inspectionPack && (
        <Modal
          isOpen={isPackModalOpen}
          onClose={() => setIsPackModalOpen(false)}
          title="Dövlət Yoxlama Paketi (Audit & Inspection Bundle)"
          size="lg"
        >
          <div className="space-y-4 text-xs text-zinc-300">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-zinc-100 text-sm">Paket İD: {inspectionPack.packId}</span>
                <span className="text-zinc-500 font-mono">
                  {new Date(inspectionPack.generatedAt).toLocaleString('az-AZ')}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400">
                Tərtib edən: <strong className="text-zinc-200">{inspectionPack.generatedBy}</strong>
              </div>
              <div className="pt-2 border-t border-zinc-800 flex items-center gap-1.5 font-mono text-[11px] text-emerald-400 break-all">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span>SHA-256 Həş: {inspectionPack.integrityHash}</span>
              </div>
            </div>

            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-[11px] text-zinc-300 max-h-60 overflow-y-auto">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(inspectionPack.manifest, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
              <Button variant="outline" onClick={() => setIsPackModalOpen(false)}>
                Bağla
              </Button>
              <Button variant="default" onClick={handleDownloadPackJson}>
                <Download className="h-4 w-4 mr-1.5" />
                Paketi Yüklə (JSON)
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
export default PrivacyCenterPage;
