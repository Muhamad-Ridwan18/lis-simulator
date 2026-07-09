function randomInRange(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function inferResultForTest(testName = '') {
  const lower = testName.toLowerCase();
  if (lower.includes('hemoglobin') || lower.includes('hb')) {
    return { value: String(randomInRange(11.5, 16.8)), normal_value: '13.0 - 17.0', flag_critical: 'N' };
  }
  if (lower.includes('leukosit') || lower.includes('wbc')) {
    const value = randomInRange(4.5, 12);
    return {
      value: String(value),
      normal_value: '4.0 - 10.0',
      flag_critical: value > 10 ? 'H' : 'N',
    };
  }
  if (lower.includes('kolesterol')) {
    const value = randomInRange(160, 260);
    return {
      value: String(value),
      normal_value: '< 200',
      flag_critical: value > 240 ? 'H' : 'N',
    };
  }
  return { value: String(randomInRange(1, 100)), normal_value: '-', flag_critical: 'N' };
}

export function buildResultPayload({ orderNumber, orderedTests, specimens, validatorName }) {
  return {
    order_number: orderNumber,
    results: orderedTests.map((test) => {
      if (!test?.test_id) {
        throw new Error(`test_id wajib ada untuk test: ${test?.test_name ?? '-'}`);
      }
      const generated = inferResultForTest(test.test_name);
      return {
        test_id: String(test.test_id),
        test_name: test.test_name,
        value: generated.value,
        normal_value: generated.normal_value,
        flag_critical: generated.flag_critical,
        notes: generated.flag_critical === 'N' ? 'Hasil dalam rentang rujukan' : 'Perlu evaluasi klinis',
      };
    }),
    specimens,
    status: 'completed',
    validation_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
    validator_name: validatorName,
    notes: 'Dikirim dari LIS standalone simulator',
  };
}
