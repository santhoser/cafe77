/** Stable, name-derived suggestions, followed by unused letter pairs. */
export function generateGroupCode(
  name: string,
  used: Iterable<string>,
): string {
  const taken = new Set(Array.from(used, (code) => code.toUpperCase()));
  const words = name.toUpperCase().match(/[A-Z]+/g) || [];
  const letters = words.join("") || "GROUP";
  const first = letters[0];
  const lastWord = words.at(-1) || letters;
  const candidates = [
    ...(letters === "COLDCOFFEE" ? ["CF"] : []),
    words.length > 1 ? first + lastWord[0] : letters.slice(0, 2),
    ...(words.length > 1
      ? [...lastWord.slice(1)]
          .filter((c) => !"AEIOU".includes(c))
          .map((c) => first + c)
      : []),
    first + letters.at(-1),
  ];
  for (let i = 0; i < letters.length; i++)
    for (let j = i + 1; j < letters.length; j++)
      candidates.push(letters[i] + letters[j]);
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) candidates.push(String.fromCharCode(a, b));
  const code = candidates.find(
    (value) => /^[A-Z]{2}$/.test(value) && !taken.has(value),
  );
  if (!code) throw new Error("All two-letter group codes are in use");
  return code;
}

export function nextItemNumber(codes: Iterable<string>): string {
  const used = new Set(Array.from(codes, (code) => Number(code.slice(-3))));
  for (let n = 101; n <= 999; n++) if (!used.has(n)) return String(n);
  throw new Error("All item numbers from 101 to 999 are in use");
}
