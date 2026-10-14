# Slopewise

A web app that teaches graphing linear equations by naming the specific mistake a student made. Runs in any browser, stores no personal data.

Built for 8th graders working on Algebra 1.

## The problem

Most math practice tools tell a student that an answer is wrong and show the correct one. That does not tell the student what went wrong in their head. A student who graphs `y = 2x + 1` with a slope of 1/2 made a specific, nameable error: they read rise over run backwards. A student who starts the line at `(2, 0)` instead of `(0, 1)` put the intercept on the wrong axis. These are different problems and need different corrections.

## How the diagnosis works

For every problem, the app computes the answer a student would produce from each known mistake, then matches the student's actual answer against that list.

For graphing `y = mx + b`, the app builds candidate lines for:

| Mistake | What the student drew |
|---|---|
| `flip` | slope inverted (run over rise) |
| `sign` | slope negated |
| `negrecip` | slope inverted and negated |
| `swap` | m and b exchanged |
| `bsign` | correct slope, intercept sign flipped |
| `origin` | correct slope through the origin, intercept ignored |
| `xaxis` | intercept plotted on the x-axis |
| `intoff` | correct slope, wrong intercept |
| `slopeoff` | correct intercept, wrong slope |

For slope from two points, it builds candidate values for:

| Mistake | What the student computed |
|---|---|
| `inv` | dx / dy instead of dy / dx |
| `order` | subtracted in inconsistent order, flipping the sign |
| `nodiv` | found the rise, never divided by the run |
| `added` | summed coordinates instead of subtracting |

Candidates that coincide with the correct answer are dropped before matching, so the app never reports a mistake for a correct answer. See `graphCands`, `slopeCands`, `diagGraph`, and `diagSlope` in `index.html`.

## Targeted practice

When the same mistake appears twice during practice, the app sets it as the focus and generates problems where that mistake is reachable, about 75% of the time, until the student stops making it. Difficulty moves on a streak: two right in a row raises the tier, two wrong lowers it. Tiers run from integer slopes, to negative slopes, to fractional slopes.

## Measuring whether it works

The session runs as pre-check, practice, post-check.

- Check 1 and Check 2 are two fixed 7-question forms, A and B, matched position by position on skill and difficulty.
- Which form comes first is randomized per session, so a harder form cannot fake an improvement.
- No feedback is shown during either check.
- Every answer is logged with the problem, the response, the diagnosed mistake, and time taken. Exports as CSV.

## Running it

Open `index.html` in a browser. No build step, no dependencies, no server.

## Privacy

No accounts, no names, no analytics. Session results are kept in the browser's own storage on the device that ran them and are never transmitted. The CSV export is manual and local.
