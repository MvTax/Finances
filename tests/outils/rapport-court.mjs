// rapport-court.mjs — rapporteur de node --test : n'affiche que les tests en échec, puis un total.
export default async function* rapportCourt(source) {
  let ok = 0, ko = 0;
  for await (const { type, data } of source) {
    if (type === 'test:pass' && data.details?.type !== 'suite') ok++;
    if (type === 'test:fail' && data.details?.type !== 'suite') {
      ko++;
      const err = data.details?.error;
      const msg = (err?.cause?.message || err?.message || String(err)).split('\n').slice(0, 6).join('\n    ');
      yield `ÉCHEC  ${data.name}\n    ${msg}\n`;
    }
  }
  yield `\n${ko ? '✗' : '✓'} ${ok} réussi(s), ${ko} en échec, ${ok + ko} au total\n`;
}
