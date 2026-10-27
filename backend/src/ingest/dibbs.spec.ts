import { consentForm, indexRows, listArchives } from './dibbs.js';

// Trimmed from the banner dibbs2.bsm.dla.mil serves in place of a zip.
const banner = `<body onload="window.name='DIBBSDocuments';">
<form method="post" action="../../../dodwarning.aspx?goto=%2fdownloads%2frfq%2farchive%2fca261022.zip" id="FrmBody" accept-charset="ISO-8859-1" autocomplete="off">
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="DB3LMguZ+/8=" />
<input type="hidden" name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="0B8E87B5" />
<input type="hidden" name="__VIEWSTATEENCRYPTED" id="__VIEWSTATEENCRYPTED" value="" />
<input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="zXim9Hws" />
<input type="submit" name="butAgree" value="OK" id="butAgree" />
</form></body>`;

describe('consentForm', () => {
  it('posts every hidden field back with OK to the resolved action', () => {
    const form = consentForm(
      banner,
      'https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive/ca261022.zip',
    );
    expect(form?.action).toBe(
      'https://dibbs2.bsm.dla.mil/dodwarning.aspx?goto=%2fdownloads%2frfq%2farchive%2fca261022.zip',
    );
    expect(Object.fromEntries(form?.body ?? [])).toEqual({
      __VIEWSTATE: 'DB3LMguZ+/8=',
      __VIEWSTATEGENERATOR: '0B8E87B5',
      __VIEWSTATEENCRYPTED: '',
      __EVENTVALIDATION: 'zXim9Hws',
      butAgree: 'OK',
    });
  });

  it('ignores pages that are not the banner', () => {
    const page = '<form method="post" action="./RfqDates.aspx"></form>';
    expect(consentForm(page, 'https://www.dibbs.bsm.dla.mil/Rfq/')).toBeNull();
  });
});

describe('listArchives', () => {
  it('keeps only ca zips, with ISO dates, newest first', () => {
    const base = 'https://dibbs2.bsm.dla.mil/Downloads/RFQ/Archive';
    const page = [
      'ca261021.zip',
      'in261022.txt',
      'bq261022.zip',
      'ca261022.zip',
    ]
      .map(
        (f) =>
          `<a href='${base}/${f}'  title='download' target='DIBBSDocuments'>${f}</a>`,
      )
      .join('\n');
    expect(listArchives(page)).toEqual([
      { fileUrl: `${base}/ca261022.zip`, date: '2026-10-22' },
      { fileUrl: `${base}/ca261021.zip`, date: '2026-10-21' },
    ]);
  });
});

describe('indexRows', () => {
  it('reads due date, AMSC and set-aside from the line end, and skips lines that do not fit', () => {
    // A real row of in261022.txt (140 characters; DIBBS ends lines with CRLF).
    const row = `SPE1C127Q01008345001516486${' '.repeat(36)}701794650610/30/26SPE1C127Q0100.pdf  0002880EAFLAG,NATIONAL        DAW02G1Y100`;
    expect(
      indexRows(
        `${row}\r\n${row.replace('10/30/26', '10/30/2X')}\r\nnot an index line\r\n`,
      ),
    ).toEqual(
      new Map([
        [
          'SPE1C127Q0100',
          { quoteDueDate: '2026-10-30', setAside: 'Y', amsc: 'G' },
        ],
      ]),
    );
  });
});
