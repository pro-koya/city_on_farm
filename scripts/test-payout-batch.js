#!/usr/bin/env node
// scripts/test-payout-batch.js
// 送金バッチスクリプトのテストユーティリティ

const { getISOWeekNumber, isValidPayoutDay } = require('./payout-batch');

console.log('=== Payout Batch Test Utility ===\n');

// 曜日名の配列
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// テストケース: 各種日付でISO週番号と実行可否を確認
const testDates = [
  new Date('2025-01-06'), // 月曜日, ISO週1 (奇数) - スキップ
  new Date('2025-01-13'), // 月曜日, ISO週2 (偶数) - 実行
  new Date('2025-01-20'), // 月曜日, ISO週3 (奇数) - スキップ
  new Date('2025-01-27'), // 月曜日, ISO週4 (偶数) - 実行
  new Date('2025-01-28'), // 火曜日, ISO週4 (偶数) - スキップ (月曜日ではない)
  new Date('2025-12-27'), // 土曜日, ISO週52 (偶数) - スキップ (月曜日ではない)
  new Date('2025-12-29'), // 月曜日, ISO週1 (奇数) - スキップ
];

console.log('Test Cases:\n');
console.log('Date                | Day       | ISO Week | Even? | Monday? | Execute?');
console.log('-------------------|-----------|----------|-------|---------|----------');

testDates.forEach(date => {
  const dayName = dayNames[date.getDay()];
  const isoWeek = getISOWeekNumber(date);
  const isEven = isoWeek % 2 === 0;
  const isMonday = date.getDay() === 1;
  const shouldExecute = isValidPayoutDay(date);

  console.log(
    `${date.toISOString().split('T')[0]} | ` +
    `${dayName.padEnd(9)} | ` +
    `${String(isoWeek).padStart(8)} | ` +
    `${isEven ? 'Yes  ' : 'No   '} | ` +
    `${isMonday ? 'Yes    ' : 'No     '} | ` +
    `${shouldExecute ? 'YES' : 'NO'}`
  );
});

console.log('\n=== Current Date Information ===\n');

const now = new Date();
const currentISOWeek = getISOWeekNumber(now);
const currentIsValid = isValidPayoutDay(now);

console.log(`Current Date: ${now.toISOString().split('T')[0]} (${dayNames[now.getDay()]})`);
console.log(`ISO Week: ${currentISOWeek} (${currentISOWeek % 2 === 0 ? 'Even' : 'Odd'})`);
console.log(`Is Monday: ${now.getDay() === 1 ? 'Yes' : 'No'}`);
console.log(`Should Execute Payout: ${currentIsValid ? 'YES' : 'NO'}`);

console.log('\n=== Next Scheduled Payout Dates ===\n');

// 次の5回の実行予定日を計算
const nextPayouts = [];
let checkDate = new Date(now);
checkDate.setDate(checkDate.getDate() - checkDate.getDay() + 1); // 今週の月曜日

for (let i = 0; i < 10; i++) {
  const testDate = new Date(checkDate);
  testDate.setDate(checkDate.getDate() + (i * 7)); // 毎週月曜日

  if (testDate < now) continue; // 過去の日付はスキップ

  const week = getISOWeekNumber(testDate);
  const willExecute = isValidPayoutDay(testDate);

  if (willExecute) {
    nextPayouts.push({
      date: testDate.toISOString().split('T')[0],
      week
    });
  }

  if (nextPayouts.length >= 5) break;
}

nextPayouts.forEach((payout, index) => {
  console.log(`${index + 1}. ${payout.date} (ISO Week ${payout.week})`);
});

console.log('\n=== Test Complete ===\n');
