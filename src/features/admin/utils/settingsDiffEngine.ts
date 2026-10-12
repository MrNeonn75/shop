import { SystemParameters, SettingsFieldDiff } from '../types/systemSettings';

/**
 * Computes deep field differences between two SystemParameters objects
 */
export function computeSettingsDiff(
  oldSettings: Partial<SystemParameters>,
  newSettings: Partial<SystemParameters>
): SettingsFieldDiff[] {
  const diffs: SettingsFieldDiff[] = [];

  // 1. General
  if (oldSettings.general?.companyName !== newSettings.general?.companyName) {
    diffs.push({
      section: 'general',
      sectionLabelAz: 'Ümumi Məlumat',
      field: 'companyName',
      fieldLabelAz: 'Şirkət Adı',
      oldValue: oldSettings.general?.companyName,
      newValue: newSettings.general?.companyName,
    });
  }
  if (oldSettings.general?.voen !== newSettings.general?.voen) {
    diffs.push({
      section: 'general',
      sectionLabelAz: 'Ümumi Məlumat',
      field: 'voen',
      fieldLabelAz: 'VÖEN',
      oldValue: oldSettings.general?.voen,
      newValue: newSettings.general?.voen,
      isSensitive: true,
    });
  }

  // 2. Currency & Rounding
  if (oldSettings.currency?.roundingRule !== newSettings.currency?.roundingRule) {
    diffs.push({
      section: 'currency',
      sectionLabelAz: 'Valyuta və Yuvarlaqlaşdırma',
      field: 'roundingRule',
      fieldLabelAz: 'Yuvarlaqlaşdırma Qaydası',
      oldValue: oldSettings.currency?.roundingRule,
      newValue: newSettings.currency?.roundingRule,
      isSensitive: true,
    });
  }
  if (oldSettings.currency?.decimalPlaces !== newSettings.currency?.decimalPlaces) {
    diffs.push({
      section: 'currency',
      sectionLabelAz: 'Valyuta və Yuvarlaqlaşdırma',
      field: 'decimalPlaces',
      fieldLabelAz: 'Kəsr Hissə Dərəcəsi',
      oldValue: oldSettings.currency?.decimalPlaces,
      newValue: newSettings.currency?.decimalPlaces,
    });
  }

  // 3. Tax Rates
  if (oldSettings.tax?.rates && newSettings.tax?.rates) {
    const oldStandardRate = oldSettings.tax.rates.find((r) => r.isDefault)?.ratePercent;
    const newStandardRate = newSettings.tax.rates.find((r) => r.isDefault)?.ratePercent;
    if (oldStandardRate !== newStandardRate) {
      diffs.push({
        section: 'tax',
        sectionLabelAz: 'Vergi Siyasəti (ƏDV)',
        field: 'standardVatRate',
        fieldLabelAz: 'Əsas ƏDV Dərəcəsi (%)',
        oldValue: `${oldStandardRate}%`,
        newValue: `${newStandardRate}%`,
        isSensitive: true,
      });
    }
  }

  // 4. Return Policy
  if (oldSettings.returnPolicy?.returnWindowDays !== newSettings.returnPolicy?.returnWindowDays) {
    diffs.push({
      section: 'returnPolicy',
      sectionLabelAz: 'Qaytarma Qaydaları',
      field: 'returnWindowDays',
      fieldLabelAz: 'Müştəri Qaytarma Müddəti (Gün)',
      oldValue: oldSettings.returnPolicy?.returnWindowDays,
      newValue: newSettings.returnPolicy?.returnWindowDays,
      isSensitive: true,
    });
  }
  if (oldSettings.returnPolicy?.approvalThresholdAzn !== newSettings.returnPolicy?.approvalThresholdAzn) {
    diffs.push({
      section: 'returnPolicy',
      sectionLabelAz: 'Qaytarma Qaydaları',
      field: 'approvalThresholdAzn',
      fieldLabelAz: 'Menecer Təsdiqi Tələb Edən Məbləğ',
      oldValue: oldSettings.returnPolicy?.approvalThresholdAzn,
      newValue: newSettings.returnPolicy?.approvalThresholdAzn,
      isSensitive: true,
    });
  }

  // 5. Warehouse Policy
  if (oldSettings.warehousePolicy?.negativeStockPolicy !== newSettings.warehousePolicy?.negativeStockPolicy) {
    diffs.push({
      section: 'warehousePolicy',
      sectionLabelAz: 'Anbar və Maya Siyasəti',
      field: 'negativeStockPolicy',
      fieldLabelAz: 'Mənfi Qalıq İcazəsi',
      oldValue: oldSettings.warehousePolicy?.negativeStockPolicy,
      newValue: newSettings.warehousePolicy?.negativeStockPolicy,
      isSensitive: true,
    });
  }
  if (oldSettings.warehousePolicy?.cogsMethod !== newSettings.warehousePolicy?.cogsMethod) {
    diffs.push({
      section: 'warehousePolicy',
      sectionLabelAz: 'Anbar və Maya Siyasəti',
      field: 'cogsMethod',
      fieldLabelAz: 'Maya Hesablama Metodu',
      oldValue: oldSettings.warehousePolicy?.cogsMethod,
      newValue: newSettings.warehousePolicy?.cogsMethod,
      isSensitive: true,
    });
  }

  // 6. Receipt Template
  if (oldSettings.receiptTemplate?.paperWidth !== newSettings.receiptTemplate?.paperWidth) {
    diffs.push({
      section: 'receiptTemplate',
      sectionLabelAz: 'Kassa Çeki Şablonu',
      field: 'paperWidth',
      fieldLabelAz: 'Çap Kağızının Eni',
      oldValue: oldSettings.receiptTemplate?.paperWidth,
      newValue: newSettings.receiptTemplate?.paperWidth,
    });
  }
  if (oldSettings.receiptTemplate?.headerTitle !== newSettings.receiptTemplate?.headerTitle) {
    diffs.push({
      section: 'receiptTemplate',
      sectionLabelAz: 'Kassa Çeki Şablonu',
      field: 'headerTitle',
      fieldLabelAz: 'Çek Başlığı',
      oldValue: oldSettings.receiptTemplate?.headerTitle,
      newValue: newSettings.receiptTemplate?.headerTitle,
    });
  }

  // 7. Discount Limits
  if (oldSettings.discountLimits && newSettings.discountLimits) {
    for (const roleKey of Object.keys(newSettings.discountLimits) as Array<keyof typeof newSettings.discountLimits>) {
      const oldLimit = oldSettings.discountLimits[roleKey];
      const newLimit = newSettings.discountLimits[roleKey];
      if (oldLimit !== newLimit) {
        diffs.push({
          section: 'discountLimits',
          sectionLabelAz: 'Kassa Endirim Limitləri',
          field: `discountLimit_${roleKey}`,
          fieldLabelAz: `Maksimal Endirim: ${roleKey}`,
          oldValue: `${oldLimit}%`,
          newValue: `${newLimit}%`,
          isSensitive: true,
        });
      }
    }
  }

  return diffs;
}

