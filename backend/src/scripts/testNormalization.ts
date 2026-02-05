import { normalizeJobTitle } from '../engine/jobTitleRefinement.js';

const testCases = [
    { input: "Local SEO Manager", expected: "SEO Manager" },
    { input: "Senior SEO Manager", expected: "SEO Manager" },
    { input: "SEO", expected: "SEO Manager" },
    { input: "Head of Performance Marketing", expected: "Head of Performance" },
    { input: "Digital Marketing Manager (3221)", expected: "Digital Marketing Manager" },
    { input: "Ops Manager", expected: "Operations Manager" },
    { input: "Senior Customer Success Manager", expected: "Customer Success Manager" },
    { input: "Digital Marketing Manager - Owned Channels Apple Pay EMEIA", expected: "Digital Marketing Manager" }
];

console.log('Running normalization tests...');
let passed = 0;

for (const { input, expected } of testCases) {
    const result = normalizeJobTitle(input);
    if (result === expected) {
        console.log(`✅ PASS: "${input}" -> "${result}"`);
        passed++;
    } else {
        console.log(`❌ FAIL: "${input}" -> expected "${expected}", got "${result}"`);
    }
}

console.log(`\nTests complete. ${passed}/${testCases.length} passed.`);
if (passed === testCases.length) {
    process.exit(0);
} else {
    process.exit(1);
}
