# Slopewise

A web app that teaches Algebra 1. Stores no personal information and runs anywhere

## Problem

Most math practice tools tell a student that an answer is wrong and show the correct one. Unfortunately, it does not tell the student what went wrong in their head. Slopewise was created to improve math education for American middle schoolers by providing direct feedback and named mistakes on problems.

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

## Puzzles

`puzzles.js` holds 72 advanced Algebra problems that encourage students to look deeper into Algebra and extend their curiosity. Ranging from specific conceptual nuances to genuinely useful Algebraic tricks, these problems are curated to inspire students love for mathematics.

## Running Slopewise

Open `index.html` in a browser, or go to the vercel page

https://slopewise.vercel.app/

# AI Usage

This project was assisted by Anthropic's Opus model.

## Privacy

No information stored. Session results are kept in the browser's own storage


