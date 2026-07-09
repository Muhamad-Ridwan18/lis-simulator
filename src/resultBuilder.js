function randomInRange(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 10) / 10;
}

function generateValue(testName = '') {
  const name = testName.toLowerCase();
  if (name.includes('gula') || name.includes('glucose')) return String(randomInRange(80, 140));
  if (name.includes('hb') || name.includes('hemoglobin')) return String(randomInRange(12, 16));
  if (name.includes('leukosit') || name.includes('wbc')) return String(randomInRange(4000, 11000));
  if (name.includes('trombosit') || name.includes('plt')) return String(randomInRange(150000, 400000));
  if (name.includes('kolesterol') || name.includes('cholesterol')) return String(randomInRange(150, 240));
  if (name.includes('ureum') || name.includes('bun')) return String(randomInRange(10, 40));
  if (name.includes('kreatinin') || name.includes('creatinine')) return String(randomInRange(0.6, 1.2));
  return String(randomInRange(1, 100));
}

export function buildResultPayload(order) {
  const tests = order?.payload?.order ?? [];

  return {
    order_number: order.order_number,
    results: tests.map((test) => ({
      test_id: String(test.test_id),
      test_name: String(test.test_name ?? ''),
      value: generateValue(test.test_name ?? ''),
      flag_critical: 'N',
      nilai_normal: 'Normal',
    })),
  };
}
