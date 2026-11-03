import React, { useState } from 'react';
import { RulePack, RulePackVersion } from '../types';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  ExternalLink,
  ShieldCheck,
  FileText,
  History,
  Calendar,
  UserCheck,
  Scale,
} from 'lucide-react';

interface RuleDetailDrawerProps {
  pack: RulePack | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenVerify: (pack: RulePack) => void;
  onOpenPropose: (pack: RulePack) => void;
}

export const RuleDetailDrawer: React.FC<RuleDetailDrawerProps> = ({
  pack,
  isOpen,
  onClose,
  onOpenVerify,
  onOpenPropose,
}) => {
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number>(0);
  
  if (!pack) return null;

  const versions = pack.versions || [];
  const currentVersion: RulePackVersion =
    versions[selectedVersionIndex] || versions[versions.length - 1] || {
      id: 'v1',
      packId: pack.id,
      version: 1,
      status: 'UNVERIFIED',
      bannerUnverified: true,
      createdAt: new Date().toISOString(),
      parameters: {},
    };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return <Badge variant="success">Təsdiqlənib</Badge>;
      case 'UNVERIFIED':
        return <Badge variant="warning">Təsdiqlənməyib</Badge>;
      case 'DISPUTED':
        return <Badge variant="danger">Mübahisəli</Badge>;
      case 'SUPERSEDED':
        return <Badge variant="neutral">Əvəz olunub</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={pack.title} size="lg">
      <div className="space-y-6 text-sm text-zinc-300">
        {/* Header badges and summary */}
        <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            {getStatusBadge(pack.status)}
            {pack.isDemo && (
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded text-xs font-mono font-medium">
                DEMO
              </span>
            )}
            <span className="text-xs text-zinc-400 font-mono">v{pack.version}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenPropose(pack)}
            >
              Dəyişiklik təklif et
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => onOpenVerify(pack)}
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Təsdiqlə və Aktivləşdir
            </Button>
          </div>
        </div>

        {/* Legal Reference & Source */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2.5">
            <Scale className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">
                Qanunvericilik Əsası
              </div>
              <div className="font-medium text-zinc-100 mt-0.5">
                {pack.legalReference}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-800/60">
            <span>Mənbə tipi: <span className="text-zinc-200 uppercase">{pack.sourceType}</span></span>
            {pack.sourceUrl && (
              <a
                href={pack.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
              >
                <span>Rəsmi mənbəyə keçid</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* Verification Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3">
            <div className="text-xs text-zinc-400 flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              Təsdiq edən şəxs
            </div>
            <div className="font-medium text-zinc-200 mt-1">
              {pack.verifiedBy ? `${pack.verifiedBy.name} (${pack.verifiedBy.role})` : 'Hələ təsdiqlənməyib'}
            </div>
            {pack.verifiedAt && (
              <div className="text-xs text-zinc-500 mt-0.5 font-mono">
                {new Date(pack.verifiedAt).toLocaleString('az-AZ')}
              </div>
            )}
          </div>

          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-3">
            <div className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-amber-400" />
              Qüvvədə olma müddəti
            </div>
            <div className="font-medium text-zinc-200 mt-1">
              {pack.effectiveFrom ? new Date(pack.effectiveFrom).toLocaleDateString('az-AZ') : 'Gözlənilir'}
              {pack.effectiveTo ? ` — ${new Date(pack.effectiveTo).toLocaleDateString('az-AZ')}` : ' — Müddətsiz'}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Bakı saat qurşağı (Asia/Baku gecəyarısı)
            </div>
          </div>
        </div>

        {/* Parameters tree (JSON viewer) */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" />
            Qayda Parametrləri (Version {currentVersion.version})
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs overflow-x-auto max-h-72">
            <pre className="text-emerald-400 whitespace-pre-wrap">
              {JSON.stringify(currentVersion.parameters, null, 2)}
            </pre>
          </div>
        </div>

        {/* Version History & Diff */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-purple-400" />
            Versiya Tarixçəsi və Fərqlər ({versions.length} versiya)
          </div>

          <div className="space-y-2">
            {versions.map((ver, idx) => (
              <div
                key={ver.version}
                className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                  idx === selectedVersionIndex
                    ? 'bg-zinc-800/80 border-indigo-500/60 text-zinc-100'
                    : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-400 hover:bg-zinc-800/40'
                }`}
                onClick={() => setSelectedVersionIndex(idx)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-zinc-200">v{ver.version}</span>
                    <Badge variant={ver.status === 'VERIFIED' ? 'success' : 'neutral'} size="sm">
                      {ver.status}
                    </Badge>
                  </div>
                  <span className="text-zinc-500 font-mono">
                    {new Date(ver.createdAt).toLocaleDateString('az-AZ')}
                  </span>
                </div>
                <div className="mt-1 text-zinc-300">
                  {ver.changeNotes || 'İlkin qeydiyyat versiyası'}
                </div>
                <div className="mt-1 text-zinc-500 text-[11px]">
                  Müəllif: {ver.author}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Disclaimer */}
        <div className="p-3 bg-zinc-950/60 border border-zinc-800/60 rounded-md text-xs text-zinc-400 italic">
          Bu qayda dəsti hüquqi aktların dəyişməsi halında yeni versiya ilə əvəzlənir. Əvvəlki əməliyyatlar həmin tarixdə qüvvədə olan versiya ilə hesablanır.
        </div>
      </div>
    </Drawer>
  );
};
