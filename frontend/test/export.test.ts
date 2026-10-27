// npm test -w frontend
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csv } from '../src/lib/export.ts';

test('csv quotes delimiters, defuses formulas and writes cells as the table shows them', () => {
	assert.equal(
		csv([
			['Item', 'Qty'],
			['a,b', 'say "hi"', 'x\ny', '=1+1', '@x', -5, null, true, [{ file: 'f' }]]
		]),
		'﻿Item,Qty\r\n"a,b","say ""hi""","x\ny",\'=1+1,\'@x,-5,,Yes,"[{""file"":""f""}]"'
	);
});
