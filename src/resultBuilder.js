function randomInRange(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function nowIso() {
  return new Date().toISOString();
}

function inferResultForTest(testName = '') {
  const lower = testName.toLowerCase();
  if (lower.includes('hemoglobin') || lower.includes('hb')) {
    return { value: String(randomInRange(11.5, 16.8)), unit: 'g/dL', reference_range: '13.0 - 17.0', flag: 'N' };
  }
  if (lower.includes('leukosit') || lower.includes('wbc')) {
    const value = randomInRange(4.5, 12);
    return {
      value: String(value),
      unit: '10^3/uL',
      reference_range: '4.5 - 11.0',
      flag: value > 11 ? 'H' : 'N',
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

function resolveOrderId(order) {
  return (
    order?.order_id
    ?? order?.payload?.order_info?.order_id
    ?? order?.payload?.order_id
    ?? null
  );
}

function buildSpecimens(order, tests) {
  const incoming = order?.payload?.specimens;
  if (Array.isArray(incoming) && incoming.length) {
    return incoming.map((specimen) => ({
      specimen_type: String(specimen.specimen_type ?? 'Darah EDTA'),
      collection_time: String(specimen.collection_time ?? nowIso()),
    }));
  }

  const byType = new Map();
  tests.forEach((test, idx) => {
    const specimenType = String(test.specimen_type ?? (idx === 0 ? 'Darah EDTA' : 'Urin'));
    if (!byType.has(specimenType)) {
      byType.set(specimenType, {
        specimen_type: specimenType,
        collection_time: nowIso(),
      });
    }
  });

  return [...byType.values()];
}

export function buildResultPayload(order) {
  const tests = order?.payload?.order ?? [];
  const orderId = resolveOrderId(order);

  if (!orderId) {
    throw new Error('order_id tidak ditemukan pada order');
  }

  const validatorName = process.env.RESULT_VALIDATOR_NAME?.trim() || 'dr. Validator Lab, Sp.PK';

  return {
    order_id: String(orderId),
    status: 'completed',
    validation_time: nowIso(),
    validator_name: validatorName,
    notes: 'Pemeriksaan selesai',
    results: tests.map((test) => {
      const parameter = String(test.parameter ?? test.test_name ?? test.indicator_name ?? test.item_name ?? '');
      const itemName = String(test.item_name ?? test.test_name ?? '');
      const generated = inferResultForTest(parameter || itemName);
      const flag = String(test.flag ?? test.flag_critical ?? generated.flag);
      return {
        test_id: String(test.test_id ?? test.indicator_id ?? test.item_id ?? ''),
        parameter,
        value: String(test.value ?? generated.value),
        flag,
        reference_range: String(test.reference_range ?? test.normal_value ?? generated.reference_range),
        unit: String(test.unit ?? generated.unit),
        notes: String(test.notes ?? (flag === 'N' ? 'Hasil normal' : 'Perlu evaluasi klinis')),
        item_id: String(test.item_id ?? test.test_id ?? ''),
        item_name: itemName,
      };
    }),
    specimens: buildSpecimens(order, tests),
  };
}
