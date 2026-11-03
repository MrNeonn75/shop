/**
 * Compliance & Legal Layer Types (Azerbaijan Jurisdiction)
 * 
 * NON-NEGOTIABLE:
 * All rates, limits, and windows come from the API.
 * The frontend NEVER hardcodes legal values.
 */

export type ComplianceDomain =
  | 'tax_vat'
  | 'fiscal_receipt'
  | 'payroll_tax'
  | 'payroll_social'
  | 'labor_time'
  | 'labor_leave'
  | 'consumer_returns'
  | 'personal_data'
  | 'retention'
  | 'vat'
  | 'fiscal'
  | 'social_insurance'
  | 'work_time'
  | 'leave'
  | 'consumer_rights';

export type DomainComplianceStatus =
  | 'ACTIVE-VERIFIED'
  | 'ACTIVE-UNVERIFIED'
  | 'MISSING'
  | 'DISPUTED';

export type RuleStatus = 'UNVERIFIED' | 'VERIFIED' | 'SUPERSEDED' | 'DISPUTED';

export type PackVersionStatus =
  | 'DRAFT'
  | 'PENDING_VERIFY'
  | 'VERIFIED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUPERSEDED';

export type SourceType = 'OFFICIAL' | 'SECONDARY';

export type VerifierRole = 'accountant' | 'lawyer' | 'ACCOUNTANT' | 'LAWYER';

export type ConsentPurpose = 'marketing' | 'loyalty' | 'profiling' | 'cross_border' | 'retention';
export type ConsentMethod = 'E_SIGNATURE' | 'OTP' | 'PAPER_SCAN';

export interface LegalReference {
  actName: string;
  number?: string;
  article?: string;
}

export interface LegalRule {
  id: string;
  ruleKey: string;
  jurisdiction: string;
  domain: ComplianceDomain;
  titleAz: string;
  parameters: Record<string, any>;
  parametersSchema?: Record<string, any>;
  effectiveFrom: string;
  effectiveTo?: string | null;
  legalReference?: LegalReference | null;
  sourceUrl?: string | null;
  sourceType: SourceType;
  status: RuleStatus;
  verifiedByName?: string | null;
  verifiedByRole?: VerifierRole | null;
  verifiedAt?: string | null;
  notes?: string | null;
  version: number;
  packVersionId?: string | null;
  createdAt: string;
  editorId?: string | null;
  isDemo?: boolean;
}

export interface RuleVerification {
  id: string;
  packVersionId: string;
  action: 'VERIFY' | 'REJECT';
  verifierId: string;
  verifierName: string;
  verifierRole: VerifierRole;
  evidenceFileId?: string | null;
  evidenceNotes?: string | null;
  createdAt: string;
}

export interface RulePackVersion {
  id: string;
  author?: string;
  changeNotes?: string;
  parameters?: Record<string, any>;
  packId: string;
  version: number;
  status: PackVersionStatus;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  bannerUnverified: boolean;
  createdBy?: string | null;
  createdAt: string;
  activatedAt?: string | null;
  activatedBy?: string | null;
  notes?: string | null;
  snapshotHash?: string | null;
  rules?: LegalRule[];
  verifications?: RuleVerification[];
  isDemo?: boolean;
}

export interface RulePack {
  id: string;
  domain: ComplianceDomain;
  title?: string;
  jurisdiction?: string;
  legalReference?: string;
  sourceUrl?: string;
  sourceType?: string;
  verifiedBy?: { name: string; role: string };
  verifiedAt?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  notes?: string;
  version?: number;
  author?: string;
  code: string;
  titleAz: string;
  description?: string | null;
  sector?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';
  activeVersionId?: string | null;
  activeVersion?: RulePackVersion | null;
  versions?: RulePackVersion[];
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface DomainStatusItem {
  domain: ComplianceDomain;
  domainTitleAz?: string;
  packId?: string;
  verifiedBy?: string;
  status: DomainComplianceStatus;
  packCode?: string | null;
  packVersionId?: string | null;
  bannerUnverified: boolean;
  disputedRuleKeys: string[];
  lastVerifiedAt?: string | null;
  verifiedByName?: string | null;
}

export interface ComplianceStatusSummary {
  environment: string;
  isProduction: boolean;
  domains: DomainStatusItem[];
  critical: boolean;
  isDemo?: boolean;
}

export interface ComplianceBannerResponse {
  showBanner: boolean;
  messageAz: string;
  unverifiedDomains: string[];
  environment: string;
  isDemo?: boolean;
}

export interface VersionDiff {
  versionAId: string;
  versionBId: string;
  added: Array<{ ruleKey: string; parameters: Record<string, any>; status: string }>;
  removed: Array<{ ruleKey: string; parameters: Record<string, any>; status: string }>;
  changed: Array<{
    ruleKey: string;
    before: { parameters: Record<string, any>; status: string };
    after: { parameters: Record<string, any>; status: string };
  }>;
}

export type ObligationStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'OVERDUE';

export interface Obligation {
  id: string;
  templateCode: string;
  titleAz: string;
  ownerUserId?: string | null;
  ownerName?: string | null;
  cadence?: string | null;
  nextDue?: string | null;
  status: ObligationStatus;
  evidenceNotes?: string | null;
  completedAt?: string | null;
  companyId?: string | null;
  meta?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface OpenLegalQuestion {
  id: number;
  domain?: string;
  question?: string;
  notes?: string;
  questionNumber: number;
  titleAz: string;
  legalReference: string;
  descriptionAz: string;
  impactOnErp: string;
  status: 'PENDING_LEGAL' | 'RESOLVED';
  assignee: string;
  resolutionNotes?: string;
  isDemo?: boolean;
}

export type FiscalMode = 'REQUIRED' | 'OPTIONAL';
export type FiscalConnectionStatus = 'ACTIVE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
export type SaleFiscalState =
  | 'PREPARE'
  | 'PENDING_FISCAL'
  | 'COMPLETED'
  | 'FAILED_ROLLED_BACK'
  | 'FISCAL_UNKNOWN';

export interface FiscalStatus {
  mode: FiscalMode;
  provider?: string;
  model?: string;
  status: FiscalConnectionStatus;
  state: SaleFiscalState;
  operatorName?: string;
  deviceSerial?: string;
  lastZReportAt?: string;
  activeShiftOpen: boolean;
  shiftSalesTotal: number;
  fiscalSalesTotal: number;
  driftAlert?: boolean;
  isDemo?: boolean;
}

export interface TurnoverMonitorData {
  calendarYearTurnover: number;
  rolling12mTurnover: number;
  threshold: number;
  coefficientApplied: number;
  cashlessTurnover: number;
  cashTurnover: number;
  percentOfThreshold: number;
  alertLevel: 'NORMAL' | 'WARNING_80' | 'CRITICAL_95' | 'THRESHOLD_REACHED_100' | 'EXCEEDED';
  currentTurnover?: number;
  adjustedTurnover?: number;
  cashlessCoefficient?: number;
  percentage?: number;
  asOf: string;
  isDraft: boolean;
  isDemo?: boolean;
}

export interface DataProcessingRegisterEntry {
  id: string;
  systemModule: string;
  dataCategories: string[];
  purpose: string;
  legalBasis: string;
  subjects: string[];
  retention: string;
  storageLocation: string;
  crossBorder: boolean;
  securityMeasures: string;
  owner: string;
  reviewStatus: 'REVIEW_REQUIRED' | 'VERIFIED' | 'ARCHIVED';
  updatedAt: string;
}

export interface TransferRegisterEntry {
  id: string;
  processorName: string;
  country: string;
  purpose: string;
  safeguards: string;
  consentCoverage: boolean;
  status: 'REVIEW_REQUIRED' | 'VERIFIED' | 'ARCHIVED';
  notes?: string;
  updatedAt: string;
}

export interface PersonalDataSystemRegistration {
  id: string;
  status: 'NOT_ASSESSED' | 'EXEMPT_VERIFIED' | 'REGISTRATION_PENDING' | 'REGISTERED';
  referenceNumber?: string;
  registeredAt?: string;
  authority?: string;
  evidenceFileId?: string;
  notes?: string;
  updatedAt: string;
}

export interface DsarRequest {
  id: string;
  requestNumber: string;
  subjectName: string;
  subjectType: 'customer' | 'employee';
  contact: string;
  requestType: 'ACCESS' | 'CORRECTION' | 'BLOCKING' | 'ERASURE';
  status: 'RECEIVED' | 'IDENTITY_VERIFIED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  slaDeadline: string;
  conflictResolvedToAnonymization: boolean;
  outcomeNotes?: string;
  createdAt: string;
}

export interface RetentionRuleItem {
  id: string;
  entityType: string;
  retentionYears: number | null;
  action: 'FLAG' | 'ARCHIVE' | 'ANONYMIZE' | 'DELETE_AFTER_HOLD_CHECK';
  status: RuleStatus;
  legalReference: string;
  notes: string;
}

export interface LegalHoldItem {
  id: string;
  entityType: string;
  entityId: string;
  reason: string;
  heldByName: string;
  heldAt: string;
  releasedAt?: string | null;
  releasedByName?: string | null;
  active: boolean;
}

export interface ConsentRecord {
  id: string;
  auditHash?: string;
  recordedAt?: string;
  subjectId: string;
  subjectType: 'customer' | 'employee';
  subjectName: string;
  formVersionId: string;
  consentTextHash: string;
  purposes: {
    loyalty: boolean;
    smsMarketing: boolean;
    emailMarketing: boolean;
    profiling: boolean;
    crossBorderTransfer: boolean;
  };
  captureMethod: 'paper_scan' | 'e_signature' | 'checkbox_otp' | 'in_app';
  evidenceFileId?: string;
  capturedByName: string;
  capturedAt: string;
  verified: boolean;
  historyTimeline?: Array<{ date: string; action: string; actor: string }>;
  isDemo?: boolean;
}

export interface ProductionCalendarYear {
  year: number;
  workingDays: number;
  workingHours: number;
  status: 'UNVERIFIED' | 'VERIFIED' | 'ACTIVE';
  sourceRef: string;
  days: {
    holidays: string[];
    shortened: string[];
    transferred: string[];
  };
}

export interface InspectionPackResponse {
  packId: string;
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  sha256Hash: string;
  integrityHash?: string;
  manifest?: any;
  generatedBy?: string;
  summary: {
    fiscalReconciliationStatus: string;
    vatTotalPayable: number;
    payrollContributionsTotal: number;
    returnsProcessedCount: number;
    consentsRegisteredCount: number;
  };
  isDraft: boolean;
  downloadUrl: string;
}

export interface ProposeChangeRequest {
  effectiveFrom: string;
  notes?: string;
  rules: Array<{
    ruleKey: string;
    titleAz: string;
    parameters: Record<string, any>;
    legalReference?: LegalReference;
    sourceUrl?: string;
    sourceType?: SourceType;
  }>;
}

export interface VerifyPackRequest {
  verifierName: string;
  verifierRole: VerifierRole;
  evidenceFileId?: string;
  evidenceNotes: string;
}

export interface ActivatePackRequest {
  effectiveFrom: string;
  notes?: string;
  activationReason?: string;
}
