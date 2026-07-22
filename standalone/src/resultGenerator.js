function randomInRange(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

export function inferResultForTest(testName = '') {
  const lower = testName.toLowerCase();
  if (lower.includes('hemoglobin') || lower.includes('hb')) {
    return { value: String(randomInRange(11.5, 16.8)), unit: 'g/dL', reference_range: '12.0 - 16.0', flag: 'N' };
  }
  if (lower.includes('leukosit') || lower.includes('wbc')) {
    const value = randomInRange(4.5, 12);
    return {
      value: String(value),
      unit: '10^3/uL',
      reference_range: '4.0 - 10.0',
      flag: value > 10 ? 'H' : 'N',
    };
  }
  if (lower.includes('gula') || lower.includes('glucose') || lower.includes('gdp')) {
    const value = randomInRange(70, 160);
    return {
      value: String(value),
      unit: 'mg/dL',
      reference_range: '70 - 140',
      flag: value > 140 ? 'H' : 'N',
    };
  }
  if (lower.includes('kolesterol')) {
    const value = randomInRange(160, 260);
    return {
      value: String(value),
      unit: 'mg/dL',
      reference_range: '< 200',
      flag: value > 240 ? 'H' : 'N',
    };
  }
  return { value: String(randomInRange(1, 100)), unit: '-', reference_range: '-', flag: 'N' };
}

function buildIndicatorResult(indicator, manual = null) {
  const indicatorName = indicator.indicator_name || indicator.item_name || '-';
  const generated = inferResultForTest(indicatorName);
  const value = String(manual?.value ?? indicator.suggested?.value ?? generated.value).trim();
  if (!value) {
    throw new Error(`Nilai hasil wajib diisi untuk: ${indicatorName}`);
  }

  const flag = String(manual?.flag ?? indicator.suggested?.flag ?? generated.flag ?? 'N').trim() || 'N';
  return {
    test_id: String(manual?.test_id || indicator.test_id || indicator.indicator_id),
    indicator_name: indicatorName,
    value,
    unit: String(manual?.unit ?? indicator.unit ?? indicator.suggested?.unit ?? generated.unit ?? '-'),
    reference_range: String(manual?.reference_range ?? indicator.suggested?.reference_range ?? generated.reference_range ?? '-'),
    flag,
    notes: String(manual?.notes ?? (flag === 'N' ? 'Hasil dalam rentang rujukan' : 'Perlu evaluasi klinis')),
  };
}

/**
 * Payload hasil sesuai kontrak baru:
 * results: [{
 *   item_id, item_name,
 *   indicators: [{ test_id, indicator_name, value, ... }]
 * }]
 */
export function buildResultPayload({ orderId, orderedItems, manualResults = null, status = 'completed' }) {
  const manualMap = new Map();
  if (Array.isArray(manualResults)) {
    manualResults.forEach((row) => {
      if (row?.item_id) {
        manualMap.set(String(row.item_id), row);
      }
    });
  }

  return {
    order_id: orderId,
    status,
    results: orderedItems.map((item) => {
      if (!item?.item_id) {
        throw new Error(`item_id wajib ada untuk tindakan: ${item?.item_name ?? '-'}`);
      }

      const manualItem = manualMap.get(String(item.item_id));
      const sourceIndicators = Array.isArray(manualItem?.indicators) && manualItem.indicators.length
        ? manualItem.indicators.map((manualIndicator) => {
          const matched = (item.indicators || []).find(
            (ind) => String(ind.test_id) === String(manualIndicator.test_id)
          ) || {};
          return buildIndicatorResult({ ...matched, ...manualIndicator }, manualIndicator);
        })
        : (Array.isArray(item.indicators) && item.indicators.length
          ? item.indicators.map((indicator) => buildIndicatorResult(indicator))
          : [buildIndicatorResult({
            test_id: item.item_id,
            indicator_name: item.item_name,
            unit: item.unit,
            suggested: item.suggested,
          })]);

      return {
        item_id: String(item.item_id),
        item_name: String(item.item_name),
        indicators: sourceIndicators,
      };
    }),
  };
}
