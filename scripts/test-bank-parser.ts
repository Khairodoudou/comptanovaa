import { parseCurrencyAmount, normalizeDateStr, extractChequeNumber, cleanDescription, parseMarkdownBankTable } from '../lib/bank/statement-parser';
let passed=0,failed=0; const errors:string[]=[];
function assert(l:string,c:boolean,d?:string){if(c){console.log('  [PASS] '+l);passed++;}else{const m=d?l+' -- '+d:l;console.error('  [FAIL] '+m);errors.push(m);failed++;}}
function section(n:string){console.log('\n---\n  '+n+'\n---');}

section('T1 parseCurrencyAmount & normalizeDateStr');
assert('T1.1 800 870,00', parseCurrencyAmount('800 870,00') !== null && Math.abs(parseCurrencyAmount('800 870,00')!.amount - 800870) < 0.01);
assert('T1.2 -800 870,00 negative', parseCurrencyAmount('-800 870,00')?.isNegative === true);
assert('T1.3 (800 870,00) negative', parseCurrencyAmount('(800 870,00)')?.isNegative === true);
assert('T1.4 800.870,00', parseCurrencyAmount('800.870,00') !== null && Math.abs(parseCurrencyAmount('800.870,00')!.amount - 800870) < 0.01);
assert('T1.5 IBAN rejected', parseCurrencyAmount('DZ591900609900123456789012') === null);
assert('T1.6 Acct rejected', parseCurrencyAmount('009906000123') === null);
assert('T1.7 DA suffix', parseCurrencyAmount('150 000,00 DA') !== null);
assert('T1.8 DD/MM/YYYY', normalizeDateStr('05/03/2025') === '2025-03-05');
assert('T1.9 D-M-YY', normalizeDateStr('5-3-25') === '2025-03-05');
assert('T1.10 ISO', normalizeDateStr('2025-03-05') === '2025-03-05');
assert('T1.11 null invalid', normalizeDateStr('not-a-date') === null);
assert('T1.12 chequeNumber', extractChequeNumber('Cheque n deg 7699290 SARL') === '7699290' || extractChequeNumber('cheque 7699290') === '7699290');
assert('T1.13 cleanDesc IBAN', !cleanDescription('VIREMENT BADR IBAN DZ5919006099').includes('DZ59'));

section('T2 Multi-page');
const mp = `\n| Date | Libelle | Debit | Credit | Solde |\n| ------ | --------- | ------- | -------- | ------- |\n| 05/03/2025 | VIREMENT ENTRANT |  | 500 000,00 | 1 500 000,00 |\n| 06/03/2025 | CHEQUE 7699290 | 800 870,00 |  | 699 130,00 |\n\n| Date | Libelle | Debit | Credit | Solde |\n| ------ | --------- | ------- | -------- | ------- |\n| 07/03/2025 | VIREMENT SORTANT | 100 000,00 |  | 599 130,00 |\n| 08/03/2025 | VERSEMENT ESPECES |  | 200 000,00 | 799 130,00 |\n`;
const r_mp = parseMarkdownBankTable(mp);
assert('T2.1 4 transactions', r_mp.transactions.length === 4, 'got '+String(r_mp.transactions.length));
assert('T2.2 No header leakage', !r_mp.transactions.some(t => /libelle|^date$/i.test(t.description)));
const lastTx=r_mp.transactions[r_mp.transactions.length-1];
assert('T2.3 Last balance=799130', lastTx?.balance!==undefined && Math.abs(lastTx.balance-799130)<1);
assert('T2.4 CREDIT positive', (r_mp.transactions.find(t=>t.description.includes('ENTRANT'))?.amount??-1)>0);
assert('T2.5 DEBIT negative', (r_mp.transactions.find(t=>t.description.includes('CHEQUE'))?.amount??1)<0);

section('T3 CPA Sens D/C');
const cpa = `\n| Date | Libelle | Montant | Sens | Solde |\n| ------ | --------- | --------- | ------ | ------- |\n| 10/03/2025 | VIREMENT RECU | 300 000,00 | C | 1 000 000,00 |\n| 11/03/2025 | PAIEMENT FOURNISSEUR | 150 000,00 | D | 850 000,00 |\n| 12/03/2025 | REMISE CHEQUE | 200 000,00 | C | 1 050 000,00 |\n`;
const r_cpa = parseMarkdownBankTable(cpa);
assert('T3.1 3 transactions', r_cpa.transactions.length===3, 'got '+String(r_cpa.transactions.length));
const cpa_cr=r_cpa.transactions.find(t=>t.description.includes('VIREMENT RECU'));
const cpa_db=r_cpa.transactions.find(t=>t.description.includes('PAIEMENT'));
assert('T3.2 Sens=C positive', (cpa_cr?.amount??-1)>0, 'amount='+String(cpa_cr?.amount));
assert('T3.3 Sens=D negative', (cpa_db?.amount??1)<0, 'amount='+String(cpa_db?.amount));
assert('T3.4 No signUncertain', !cpa_cr?.signUncertain && !cpa_db?.signUncertain);

section('T4 Sign detection');
assert('T4.1 + not negative', parseCurrencyAmount('+500 000,00')?.isNegative===false);
assert('T4.2 - negative', parseCurrencyAmount('-500 000,00')?.isNegative===true);
assert('T4.3 () negative', parseCurrencyAmount('(250 000,00)')?.isNegative===true);
const pos = `\n| Date | Libelle | Debit | Credit |\n| ------ | --------- | ------- | -------- |\n| 15/03/2025 | REMBOURSEMENT |  | 100 000,00 |\n| 16/03/2025 | REJET CHEQUE | 50 000,00 |  |\n`;
const r_pos = parseMarkdownBankTable(pos);
assert('T4.4 Credit positive', (r_pos.transactions.find(t=>t.description.includes('REMBOURSEMENT'))?.amount??-1)>0);
assert('T4.5 Debit negative', (r_pos.transactions.find(t=>t.description.includes('REJET'))?.amount??1)<0);
const unc = `\n| Date | Libelle | Montant |\n| ------ | --------- | --------- |\n| 17/03/2025 | OPERATION INCONNUE | 75 000,00 |\n`;
const r_unc = parseMarkdownBankTable(unc);
assert('T4.6 signUncertain=true', r_unc.transactions[0]?.signUncertain===true, 'signUncertain='+String(r_unc.transactions[0]?.signUncertain));

section('T5 Sanity checks');
assert('T5.1 DZ IBAN rejected', parseCurrencyAmount('DZ59190060990012345678901234')===null);
assert('T5.2 15-digit rejected', parseCurrencyAmount('009906000123456')===null);
assert('T5.3 12-digit rejected', parseCurrencyAmount('123456789012')===null);
assert('T5.4 Large valid ok', parseCurrencyAmount('12 345 678,90')!==null);

section('T6 Full OCR Markdown BADR');
const ocr = `\n## Releve de Compte\nBanque: BADR\nIBAN: DZ59190060990012345678901234\n\n| Date | Date Valeur | Libelle | Debit (DA) | Credit (DA) | Solde (DA) |\n| ------ | ------------- | --------- | ------------ | ------------- | ------------ |\n| 05/03/2025 | 06/03/2025 | VIREMENT ENTRANT STE BATNA |  | 1 500 000,00 | 3 500 000,00 |\n| 10/03/2025 | 10/03/2025 | CHEQUE 7699290 SARL CARTON DZ | 800 870,00 |  | 2 699 130,00 |\n| 15/03/2025 | 16/03/2025 | FRAIS BANCAIRES | 12 500,00 |  | 2 686 630,00 |\n| 20/03/2025 | 20/03/2025 | VIREMENT RECU FOURNISSEUR BTP |  | 500 000,00 | 3 186 630,00 |\n| 28/03/2025 | 29/03/2025 | PRELEVEMENT ASSURANCE | 45 000,00 |  | 3 141 630,00 |\n`;
const r_ocr = parseMarkdownBankTable(ocr);
assert('T6.1 5 transactions', r_ocr.transactions.length===5, 'got '+String(r_ocr.transactions.length));
assert('T6.2 IBAN not in desc', !r_ocr.transactions.some(t=>/DZ59/i.test(t.description)));
assert('T6.3 No header noise', !r_ocr.transactions.some(t=>/periode|banque:/i.test(t.description)));
const chqTx=r_ocr.transactions.find(t=>t.description.includes('7699290'));
assert('T6.4 Cheque extracted', chqTx?.chequeNumber==='7699290', 'got '+String(chqTx?.chequeNumber));
const viTx=r_ocr.transactions.find(t=>t.description.includes('ENTRANT'));
assert('T6.5 ENTRANT positive', (viTx?.amount??-1)>0);
assert('T6.6 ENTRANT=1500000', viTx!==undefined && Math.abs(viTx.amount-1500000)<1);
assert('T6.7 CHEQUE negative', (chqTx?.amount??1)<0);
assert('T6.8 CHEQUE=-800870', chqTx!==undefined && Math.abs(chqTx.amount+800870)<1);
assert('T6.9 valueDate tx2', r_ocr.transactions[1]?.valueDate==='2025-03-10', 'got '+String(r_ocr.transactions[1]?.valueDate));
const lastOcr=r_ocr.transactions[r_ocr.transactions.length-1];
assert('T6.10 Balance=3141630', lastOcr?.balance!==undefined && Math.abs(lastOcr.balance-3141630)<1);

console.log('\n'+('=').repeat(60));
console.log('RESULTATS FINAUX');
console.log(('=').repeat(60));
console.log('PASSES : '+String(passed));
console.log('ECHECS : '+String(failed));
if(errors.length>0){console.log('Tests echoues :');errors.forEach(e=>console.log('  * '+e));}
console.log(('=').repeat(60));
process.exit(failed>0?1:0);
