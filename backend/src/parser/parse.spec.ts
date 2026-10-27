import { readFileSync } from 'node:fs';
import { parseRfq, procurementHistory } from './parse.js';

const fixture = (file: string) =>
  readFileSync(new URL(`../../test/fixtures/${file}`, import.meta.url));

describe('parseRfq', () => {
  // One RFQ per DLA layout (T, U, Q) plus a part number with spaces. Public, no CUI markers.
  it.each(['SPE4A627T6327', 'SPE7L327U0039', 'SPE1C127Q0100', 'SPE7L427T0562'])(
    'parses %s',
    async (name) => {
      const json = await parseRfq(fixture(`${name}.pdf`), `${name}.pdf`);
      expect(json).toEqual(JSON.parse(fixture(`${name}.json`).toString()));
    },
  );
});

describe('procurementHistory', () => {
  it('reads rows without a CAGE or contract, and 6-character CAGEs', () => {
    const { history, notes } = procurementHistory([
      'Procurement History for NSN/FSC:015891060/2910',
      'CAGE Contract Number Quantity Unit Cost AWD Date Surplus Material',
      '. NOT FO DLA50082P3623 1000.000 2.51000 19811109 N SDM06M SPEFA517Z0006 40.000 47.87175 20170301 Y' +
        ' 076M6 5.000 0.00000 20071108 N This paragraph follows the table.',
    ]);
    const nsn = '2910-01-589-1060';
    expect(history).toEqual([
      {
        nsn,
        cage: null,
        contract: 'DLA50082P3623',
        quantity: 1000,
        unit_price: 2.51,
        award_date: '1981-11-09',
        surplus: false,
      },
      {
        nsn,
        cage: 'SDM06M',
        contract: 'SPEFA517Z0006',
        quantity: 40,
        unit_price: 47.87175,
        award_date: '2017-03-01',
        surplus: true,
      },
      {
        nsn,
        cage: '076M6',
        contract: null,
        quantity: 5,
        unit_price: 0,
        award_date: '2007-11-08',
        surplus: false,
      },
    ]);
    expect(notes).toEqual(['This paragraph follows the table.']);
  });
});
