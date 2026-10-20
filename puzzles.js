/* puzzles.js
   the puzzle library: 72 original algebra 1 puzzles in 7 sets, easiest
   first inside each set. 

   each puzzle:
     id      - unique, used to remember which ones are solved
     title   - short name
     prompt  - the question, html
     kind    - how the answer goes in:
                 line   tap two points on the grid
                 point  tap one point
                 choice pick one of several
                 num, list, pair, ineq, compound, expr
                        typed, read by the parsers in topics.js
     answer  - line:   {m: {n, d}, b}
               point:  [x, y]
               choice: index of the right choice
               typed:  the answer written the way a student would type it
     show    - what is answered, as html, for the solution
     idea    - the one idea the puzzle is built on
     steps   - the worked solution, one string per step
     hint    - shown after a wrong try
     board   - optional extras on the grid: given, stars, lines
     curve   - optional y = f(x), drawn once the puzzle is solved or shown
*/

const PUZZLE_DATA = (() => {
  const eq = s => `<span class="eq-inline">${s}</span>`;
  const F = (top, bottom) => `<span class="frac"><span>${top}</span><span>${bottom}</span></span>`;
  const m = (n, d = 1) => ({ n, d });

  const lines = {
    title: 'Lines',
    blurb: 'Slope, intercepts, parallel and perpendicular lines.',
    puzzles: [
      {
        id: 'stars',
        title: 'Through both stars',
        prompt: 'Draw the line that passes through both stars.',
        kind: 'line',
        board: { stars: [[-4, -1], [2, 2]] },
        answer: { m: m(1, 2), b: 1 },
        idea: 'Slope is rise over run between any two points on a line.',
        steps: [
          'From (−4, −1) to (2, 2) the rise is 3 and the run is 6.',
          `Slope = ${F(3, 6)} = ${F(1, 2)}.`,
          'Walk back 4 from (−4, −1) at that slope and you reach (0, 1), so b = 1.'
        ],
        hint: 'Count the rise and run from one star to the other, then simplify the fraction.'
      },
      {
        id: 'axes',
        title: 'Hit both axes',
        prompt: 'Draw the line that crosses the x-axis at 4 and the y-axis at −2.',
        kind: 'line',
        answer: { m: m(1, 2), b: -2 },
        idea: 'An intercept is a point: (4, 0) and (0, −2) are on the line.',
        steps: [
          'Plot (4, 0) and (0, −2).',
          `From (0, −2) to (4, 0) the rise is 2 and the run is 4, so the slope is ${F(1, 2)}.`
        ],
        hint: 'Those two crossings are points you can plot: (4, 0) and (0, −2).'
      },
      {
        id: 'parallel',
        title: 'Parallel track',
        prompt: `The gray line is ${eq('y = 2x − 1')}. Draw the line parallel to it that passes through the star.`,
        kind: 'line',
        board: { given: { m: 2, b: -1 }, stars: [[1, 4]] },
        answer: { m: m(2), b: 2 },
        idea: 'Parallel lines have the same slope and different intercepts.',
        steps: [
          'Keep the slope 2.',
          'From (1, 4), step back 1 and down 2 to (0, 2), so b = 2.'
        ],
        hint: 'Parallel lines have the same slope. Start at the star and use a rise of 2 and a run of 1.'
      },
      {
        id: 'perp',
        title: 'Right angle',
        prompt: `The gray line is ${eq(`y = ${F(1, 2)}x + 1`)}. Draw the line perpendicular to it through the star.`,
        kind: 'line',
        board: { given: { m: 0.5, b: 1 }, stars: [[2, 2]] },
        answer: { m: m(-2), b: 6 },
        idea: 'Perpendicular slopes multiply to −1, so each is the negative reciprocal of the other.',
        steps: [
          `Flip ${F(1, 2)} to get 2, then change the sign: −2.`,
          'From (2, 2), step back 2 and up 4 to (0, 6), so b = 6.'
        ],
        hint: 'Perpendicular slopes are negative reciprocals. Flip 1/2 and change its sign.'
      },
      {
        id: 'mirror',
        title: 'Same start, new slope',
        prompt: `The gray line is ${eq(`y = ${F(2, 3)}x − 2`)}. Draw a line with the same y-intercept that passes through the star.`,
        kind: 'line',
        board: { given: { m: 2 / 3, b: -2 }, stars: [[3, -4]] },
        answer: { m: m(-2, 3), b: -2 },
        idea: 'Two points pin down a line. Here one of them is the shared intercept.',
        steps: [
          'Both lines pass through (0, −2).',
          `From (0, −2) to (3, −4) the rise is −2 and the run is 3, so the slope is −${F(2, 3)}.`
        ],
        hint: 'Both lines cross the y-axis at −2. Count from (0, −2) to the star.'
      },
      {
        id: 'standard',
        title: 'Unpack it',
        prompt: `Draw the line ${eq('2x + 3y = 6')}.`,
        kind: 'line',
        answer: { m: m(-2, 3), b: 2 },
        idea: 'Standard form hides the slope. Solving for y, or finding both intercepts, brings it out.',
        steps: [
          'Set x = 0: 3y = 6, so the line passes through (0, 2).',
          'Set y = 0: 2x = 6, so the line passes through (3, 0).',
          'Connect the two intercepts.'
        ],
        hint: 'Solve for y first. 3y = −2x + 6, then divide everything by 3.'
      },
      {
        id: 'three',
        title: 'Three in a row',
        prompt: 'Three of these four stars sit on one line. Draw that line.',
        kind: 'line',
        board: { stars: [[-3, -5], [0, -1], [3, 3], [2, 2]] },
        answer: { m: m(4, 3), b: -1 },
        idea: 'Points are on one line exactly when every pair gives the same slope.',
        steps: [
          `(−3, −5) to (0, −1): slope ${F(4, 3)}. (0, −1) to (3, 3): slope ${F(4, 3)}. Same slope, same line.`,
          `(0, −1) to (2, 2) has slope ${F(3, 2)}, so (2, 2) is the odd one out.`
        ],
        hint: 'Try pairs of stars. The right line lands exactly on a third star.'
      },
      {
        id: 'wide',
        title: 'Long way across',
        prompt: 'Draw the line through both stars.',
        kind: 'line',
        board: { stars: [[-5, 4], [5, -2]] },
        answer: { m: m(-3, 5), b: 1 },
        idea: 'The midpoint of two points sits on the line between them, which can find the intercept for you.',
        steps: [
          `Rise −6 over run 10 simplifies to −${F(3, 5)}.`,
          'The midpoint of the stars is (0, 1), right on the y-axis, so b = 1.'
        ],
        hint: 'A rise of −6 over a run of 10 simplifies to −3/5. Look for where the line crosses the y-axis.'
      },
      {
        id: 'collinear',
        title: 'Find the missing point',
        prompt: 'The points (1, 3), (4, 9), and (6, k) all lie on one line. What is k?',
        kind: 'num',
        answer: '13',
        show: 'k = 13',
        idea: 'Every pair of points on a line gives the same slope.',
        steps: [
          `Slope from (1, 3) to (4, 9): ${F(6, 3)} = 2.`,
          'From (4, 9), move 2 right to x = 6. The line rises 2 × 2 = 4.',
          'k = 9 + 4 = 13.'
        ],
        hint: 'Find the slope from the first two points. The third point has to keep that slope.'
      },
      {
        id: 'triangle',
        title: 'Corner triangle',
        prompt: `The line ${eq('3x + 2y = 12')} and the two axes enclose a triangle. What is its area?`,
        kind: 'num',
        answer: '12',
        show: '12 square units',
        idea: 'Intercepts give the legs of the triangle a line cuts off with the axes.',
        steps: [
          'x-intercept: 3x = 12, so x = 4. y-intercept: 2y = 12, so y = 6.',
          `The triangle has legs 4 and 6, so its area is ${F(1, 2)} × 4 × 6 = 12.`
        ],
        hint: 'Find where the line crosses each axis. Those are the two legs of a right triangle.'
      },
      {
        id: 'nevermeet',
        title: 'Never meet',
        prompt: `For what value of a does the line ${eq('y = ax + 3')} never cross the line ${eq('4x − 2y = 7')}?`,
        kind: 'num',
        answer: '2',
        show: 'a = 2',
        idea: 'Lines that never meet are parallel: same slope, different intercept.',
        steps: [
          `Solve 4x − 2y = 7 for y: y = 2x − ${F(7, 2)}.`,
          `Its slope is 2. With a = 2, the lines are parallel, and 3 ≠ −${F(7, 2)}, so they never touch.`
        ],
        hint: 'Rewrite 4x − 2y = 7 as y = mx + b. Which slope can never catch up to it?'
      },
      {
        id: 'perpk',
        title: 'Square corner',
        prompt: `The lines ${eq('2x + ky = 5')} and ${eq('3x − 4y = 1')} are perpendicular. What is k?`,
        kind: 'num',
        answer: '3/2',
        show: `k = ${F(3, 2)}`,
        idea: 'Perpendicular slopes multiply to −1.',
        steps: [
          `First line: y = −${F(2, 'k')}x + ${F(5, 'k')}, so its slope is −${F(2, 'k')}.`,
          `Second line: y = ${F(3, 4)}x − ${F(1, 4)}, so its slope is ${F(3, 4)}.`,
          `(−${F(2, 'k')})(${F(3, 4)}) = −1 gives ${F(6, '4k')} = 1, so k = ${F(3, 2)}.`
        ],
        hint: 'Solve both equations for y to get their slopes, then set the product of the slopes to −1.'
      }
    ]
  };

  const systems = {
    title: 'Systems',
    blurb: 'Two equations at once, and how many answers they can share.',
    puzzles: [
      {
        id: 'meet',
        title: 'Where they cross',
        prompt: `Tap the point where ${eq('y = x + 1')} and ${eq('y = −2x + 4')} meet.`,
        kind: 'point',
        board: { lines: [{ m: 1, b: 1, cls: 'sys1' }, { m: -2, b: 4, cls: 'sys2' }] },
        answer: [1, 2],
        idea: 'The solution of a system is the one point on both lines.',
        steps: [
          'Set the right sides equal: x + 1 = −2x + 4.',
          '3x = 3, so x = 1. Then y = 1 + 1 = 2.',
          'Check in the other line: −2(1) + 4 = 2.'
        ],
        hint: 'Set x + 1 equal to −2x + 4 and solve, or read the crossing off the grid.'
      },
      {
        id: 'elim',
        title: 'Cancel out',
        prompt: `Solve the system ${eq('2x + 3y = 12')} and ${eq('5x − 3y = 9')}.`,
        kind: 'pair',
        answer: '(3, 2)',
        show: '(3, 2)',
        idea: 'Adding the equations removes y because its coefficients are opposites.',
        steps: [
          'Add the equations: 7x = 21, so x = 3.',
          '2(3) + 3y = 12, so 3y = 6 and y = 2.'
        ],
        hint: 'Look at the y terms. What happens when you add the two equations?'
      },
      {
        id: 'twonums',
        title: 'Two numbers',
        prompt: 'Two numbers add to 30. One of them is 6 more than twice the other. What is the larger number?',
        kind: 'num',
        answer: '22',
        show: '22',
        idea: 'Each sentence becomes one equation, and substitution joins them.',
        steps: [
          'Let the smaller be x and the larger be 2x + 6.',
          'x + (2x + 6) = 30, so 3x = 24 and x = 8.',
          'The larger is 2(8) + 6 = 22.'
        ],
        hint: 'Call the smaller number x. Write the larger one in terms of x.'
      },
      {
        id: 'coins',
        title: 'Coin jar',
        prompt: 'A jar holds 25 coins, all dimes and quarters, worth $4.15 in total. How many quarters are in the jar?',
        kind: 'num',
        answer: '11',
        show: '11 quarters',
        idea: 'One equation counts the coins, the other counts the money.',
        steps: [
          'd + q = 25 and 10d + 25q = 415, counting in cents.',
          'Substitute d = 25 − q: 250 − 10q + 25q = 415.',
          '15q = 165, so q = 11. Check: 14 dimes and 11 quarters make $1.40 + $2.75 = $4.15.'
        ],
        hint: 'Work in cents. One equation for the number of coins, one for the value.'
      },
      {
        id: 'threeway',
        title: 'Add them all',
        prompt: `${eq('x + y = 7')}, ${eq('y + z = 11')}, and ${eq('x + z = 10')}. What is x + y + z?`,
        kind: 'num',
        answer: '14',
        show: '14',
        idea: 'Sometimes adding every equation answers the question without solving for each letter.',
        steps: [
          'Add all three: 2x + 2y + 2z = 28.',
          'Divide by 2: x + y + z = 14.'
        ],
        hint: 'Add all three equations together. How many times does each letter appear?'
      },
      {
        id: 'howmany',
        title: 'How many answers',
        prompt: `How many solutions does the system ${eq('y = 2x + 3')} and ${eq('4x − 2y = 5')} have?`,
        kind: 'choice',
        choices: ['None', 'Exactly one', 'Exactly two', 'Infinitely many'],
        answer: 0,
        show: 'None',
        idea: 'Same slope and different intercepts means parallel lines, which never meet.',
        steps: [
          `Solve 4x − 2y = 5 for y: y = 2x − ${F(5, 2)}.`,
          `Both lines have slope 2, but the intercepts are 3 and −${F(5, 2)}, so the lines are parallel.`
        ],
        hint: 'Put the second equation in y = mx + b form and compare slopes.'
      },
      {
        id: 'sameline',
        title: 'Secretly the same',
        prompt: `For what value of c does the system ${eq('3x + 6y = 9')} and ${eq('x + 2y = c')} have infinitely many solutions?`,
        kind: 'num',
        answer: '3',
        show: 'c = 3',
        idea: 'Infinitely many solutions means both equations describe the same line.',
        steps: [
          'Divide 3x + 6y = 9 by 3: x + 2y = 3.',
          'The second equation matches it exactly when c = 3.'
        ],
        hint: 'Can you divide the first equation by something to make it look like the second?'
      },
      {
        id: 'nosolution',
        title: 'Build a dead end',
        prompt: `Draw a line through the star that makes a system with no solution together with ${eq('y = −x + 2')}.`,
        kind: 'line',
        board: { given: { m: -1, b: 2 }, stars: [[0, -3]] },
        answer: { m: m(-1), b: -3 },
        idea: 'No solution means the lines never meet, so they must be parallel.',
        steps: [
          'Keep the slope −1 so the lines stay parallel.',
          'Pass through the star at (0, −3): y = −x − 3.'
        ],
        hint: 'Which kind of line never meets y = −x + 2?'
      }
    ]
  };

  const inequalities = {
    title: 'Inequalities',
    blurb: 'Inequalities, absolute value, and "and" versus "or".',
    puzzles: [
      {
        id: 'flip',
        title: 'Watch the sign',
        prompt: `Solve ${eq('−3x + 5 > 17')}.`,
        kind: 'ineq',
        answer: 'x < -4',
        show: 'x < −4',
        idea: 'Dividing both sides by a negative number flips the inequality.',
        steps: [
          'Subtract 5: −3x > 12.',
          'Divide by −3 and flip the sign: x < −4.',
          'Check x = −5: 15 + 5 = 20, and 20 > 17.'
        ],
        hint: 'What happens to an inequality when you divide both sides by a negative number?'
      },
      {
        id: 'intcount',
        title: 'Count the integers',
        prompt: `How many integers x satisfy ${eq('−4 < 2x + 2 ≤ 9')}?`,
        kind: 'num',
        answer: '6',
        show: '6 integers',
        idea: 'Do the same step to all three parts of a compound inequality.',
        steps: [
          'Subtract 2 from all three parts: −6 < 2x ≤ 7.',
          `Divide by 2: −3 < x ≤ 3${F(1, 2)}.`,
          'The integers are −2, −1, 0, 1, 2, 3.'
        ],
        hint: 'Get x alone in the middle, then list the integers in the range. Watch which ends are included.'
      },
      {
        id: 'texts',
        title: 'Texting budget',
        prompt: 'A phone plan costs $20 a month plus $0.15 per text. Your budget is $35. What is the most texts you can send in a month?',
        kind: 'num',
        answer: '100',
        show: '100 texts',
        idea: 'A budget is a "less than or equal to" inequality.',
        steps: [
          '20 + 0.15t ≤ 35.',
          '0.15t ≤ 15, so t ≤ 100.'
        ],
        hint: 'Write cost ≤ 35 with t as the number of texts.'
      },
      {
        id: 'abstwo',
        title: 'Two ways out',
        prompt: `Solve ${eq('|2x − 3| = 7')}. Give every solution.`,
        kind: 'list',
        answer: '5, -2',
        show: 'x = 5 or x = −2',
        idea: 'Absolute value is distance from 0, and both 7 and −7 are 7 away.',
        steps: [
          '2x − 3 = 7 gives 2x = 10, so x = 5.',
          '2x − 3 = −7 gives 2x = −4, so x = −2.'
        ],
        hint: 'The inside could be 7 or −7. Solve both.'
      },
      {
        id: 'absnone',
        title: 'Impossible?',
        prompt: `How many solutions does ${eq('|x + 4| + 6 = 2')} have?`,
        kind: 'choice',
        choices: ['0', '1', '2', 'Infinitely many'],
        answer: 0,
        show: '0',
        idea: 'An absolute value is never negative.',
        steps: [
          'Subtract 6: |x + 4| = −4.',
          'A distance cannot be −4, so there are no solutions.'
        ],
        hint: 'Get the absolute value alone first. What is it equal to?'
      },
      {
        id: 'absband',
        title: 'Inside the band',
        prompt: `Solve ${eq('|x − 2| ≤ 5')}. Write the answer as one compound inequality.`,
        kind: 'compound',
        answer: '-3 <= x <= 7',
        show: '−3 ≤ x ≤ 7',
        idea: '|x − 2| ≤ 5 means x is at most 5 away from 2.',
        steps: [
          'Rewrite as −5 ≤ x − 2 ≤ 5.',
          'Add 2 to every part: −3 ≤ x ≤ 7.'
        ],
        hint: 'Which numbers are at most 5 away from 2?'
      },
      {
        id: 'within',
        title: 'Close to ten',
        prompt: 'Write every number that is within 3 of 10 as a compound inequality.',
        kind: 'compound',
        answer: '7 <= x <= 13',
        show: '7 ≤ x ≤ 13, the same as |x − 10| ≤ 3',
        idea: 'Distance between x and 10 is |x − 10|.',
        steps: [
          'Within 3 of 10 means |x − 10| ≤ 3.',
          'So −3 ≤ x − 10 ≤ 3, which gives 7 ≤ x ≤ 13.'
        ],
        hint: 'Go 3 left of 10 and 3 right of 10.'
      },
      {
        id: 'absvertex',
        title: 'Bottom of the V',
        prompt: `Tap the vertex of ${eq('y = |x + 3| − 2')}.`,
        kind: 'point',
        answer: [-3, -2],
        curve: x => Math.abs(x + 3) - 2,
        idea: 'The smallest |x + 3| can be is 0, which happens at x = −3.',
        steps: [
          '|x + 3| = 0 when x = −3.',
          'Then y = 0 − 2 = −2, the lowest point of the V.'
        ],
        hint: 'What x makes the inside of the absolute value 0?'
      },
      {
        id: 'abscase',
        title: 'Check your answer',
        prompt: `Solve ${eq('|x − 4| = x')}.`,
        kind: 'num',
        answer: '2',
        show: 'x = 2',
        idea: 'Splitting into cases can create answers that do not work. Check each one.',
        steps: [
          'Case 1: x − 4 = x gives −4 = 0, which is impossible.',
          'Case 2: x − 4 = −x gives 2x = 4, so x = 2.',
          'Check: |2 − 4| = 2. It works.'
        ],
        hint: 'Try x − 4 = x and x − 4 = −x. Check what you get in the original equation.'
      },
      {
        id: 'andor',
        title: 'And versus or',
        prompt: 'Which of these has no solution?',
        kind: 'choice',
        choices: ['x > 3 and x < 1', 'x > 3 or x < 1', 'x ≥ 2 and x ≤ 2', 'x < 5 or x > 5'],
        answer: 0,
        show: 'x > 3 and x < 1',
        idea: '"And" needs both to be true at once. "Or" needs only one.',
        steps: [
          'No number is both bigger than 3 and smaller than 1.',
          'x ≥ 2 and x ≤ 2 has exactly one solution, x = 2. The two "or" choices each have infinitely many.'
        ],
        hint: 'For each choice, try to find one number that works.'
      }
    ]
  };

  const quadratics = {
    title: 'Quadratics',
    blurb: 'Parabolas, factoring, and the patterns hiding in them.',
    puzzles: [
      {
        id: 'vertex',
        title: 'Find the turn',
        prompt: `Tap the vertex of ${eq('y = x<sup>2</sup> − 4x + 1')}.`,
        kind: 'point',
        answer: [2, -3],
        curve: x => x * x - 4 * x + 1,
        idea: `The vertex of y = ax<sup>2</sup> + bx + c is at x = −${F('b', '2a')}.`,
        steps: [
          `Here a = 1 and b = −4, so x = ${F(4, 2)} = 2.`,
          'y = 4 − 8 + 1 = −3.'
        ],
        hint: 'Use x = −b/(2a), then plug that x back in for y.'
      },
      {
        id: 'touch',
        title: 'Just touching',
        prompt: `Tap the point where ${eq('y = x<sup>2</sup> − 6x + 9')} touches the x-axis.`,
        kind: 'point',
        answer: [3, 0],
        curve: x => (x - 3) ** 2,
        idea: 'A perfect square trinomial has one repeated root, so its parabola touches the x-axis once.',
        steps: [
          'x<sup>2</sup> − 6x + 9 = (x − 3)<sup>2</sup>.',
          '(x − 3)<sup>2</sup> = 0 only at x = 3.'
        ],
        hint: 'Try to write x² − 6x + 9 as something squared.'
      },
      {
        id: 'rootsum',
        title: 'Sum of roots',
        prompt: `What is the sum of the two solutions of ${eq('x<sup>2</sup> − 9x + 14 = 0')}?`,
        kind: 'num',
        answer: '9',
        show: '9',
        idea: 'In x<sup>2</sup> + bx + c = (x − r)(x − s), the roots add to −b and multiply to c.',
        steps: [
          'x<sup>2</sup> − 9x + 14 = (x − 2)(x − 7).',
          'The roots are 2 and 7, which add to 9, the opposite of −9.'
        ],
        hint: 'Factor it, or think about what the middle coefficient tells you.'
      },
      {
        id: 'sumproduct',
        title: 'Sum and product',
        prompt: 'Two numbers add to 10 and multiply to 21. What are they?',
        kind: 'list',
        answer: '3, 7',
        show: '3 and 7',
        idea: 'Numbers with sum s and product p are the roots of x<sup>2</sup> − sx + p = 0.',
        steps: [
          'They solve x<sup>2</sup> − 10x + 21 = 0.',
          '(x − 3)(x − 7) = 0, so the numbers are 3 and 7.'
        ],
        hint: 'Write a quadratic whose roots add to 10 and multiply to 21.'
      },
      {
        id: 'onek',
        title: 'Exactly one',
        prompt: `For what value of k does ${eq('x<sup>2</sup> + 6x + k = 0')} have exactly one solution?`,
        kind: 'num',
        answer: '9',
        show: 'k = 9',
        idea: 'One solution means the discriminant b<sup>2</sup> − 4ac is 0.',
        steps: [
          'b<sup>2</sup> − 4ac = 36 − 4k.',
          '36 − 4k = 0 gives k = 9, and x<sup>2</sup> + 6x + 9 = (x + 3)<sup>2</sup>.'
        ],
        hint: 'Which part of the quadratic formula decides how many solutions there are?'
      },
      {
        id: 'symmetry',
        title: 'Halfway',
        prompt: 'A parabola crosses the x-axis at x = −1 and x = 5. What is the x-coordinate of its vertex?',
        kind: 'num',
        answer: '2',
        show: 'x = 2',
        idea: 'A parabola is symmetric, so the vertex sits halfway between the roots.',
        steps: [
          `Halfway between −1 and 5 is ${F('−1 + 5', 2)} = 2.`
        ],
        hint: 'A parabola is a mirror image of itself. Where is the mirror?'
      },
      {
        id: 'completesq',
        title: 'Complete the square',
        prompt: `Write ${eq('x<sup>2</sup> + 8x + 10')} as ${eq('(x + h)<sup>2</sup> + k')}. What is k?`,
        kind: 'num',
        answer: '-6',
        show: 'k = −6, since x<sup>2</sup> + 8x + 10 = (x + 4)<sup>2</sup> − 6',
        idea: '(x + h)<sup>2</sup> = x<sup>2</sup> + 2hx + h<sup>2</sup>, so h is half the x coefficient.',
        steps: [
          'Half of 8 is 4, and (x + 4)<sup>2</sup> = x<sup>2</sup> + 8x + 16.',
          'You need 10, not 16, so subtract 6: (x + 4)<sup>2</sup> − 6.'
        ],
        hint: 'Half of 8 is 4. Expand (x + 4)² and compare it with what you have.'
      },
      {
        id: 'rect',
        title: 'Rectangle',
        prompt: 'A rectangle is 3 units longer than it is wide, and its area is 40. How wide is it?',
        kind: 'num',
        answer: '5',
        show: 'width 5',
        idea: 'Area problems turn into quadratics. Throw out the root that makes no sense.',
        steps: [
          'w(w + 3) = 40, so w<sup>2</sup> + 3w − 40 = 0.',
          '(w + 8)(w − 5) = 0, so w = 5 or w = −8.',
          'A width cannot be negative, so w = 5. Check: 5 × 8 = 40.'
        ],
        hint: 'Call the width w. The length is w + 3.'
      },
      {
        id: 'mental',
        title: 'No calculator',
        prompt: 'Find 51 × 49 without multiplying it out.',
        kind: 'num',
        answer: '2499',
        show: '2499',
        idea: '(a + b)(a − b) = a<sup>2</sup> − b<sup>2</sup>.',
        steps: [
          '51 × 49 = (50 + 1)(50 − 1).',
          '50<sup>2</sup> − 1<sup>2</sup> = 2500 − 1 = 2499.'
        ],
        hint: 'Both numbers are 1 away from 50.'
      },
      {
        id: 'diffsq',
        title: 'Shortcut',
        prompt: `${eq('x<sup>2</sup> − y<sup>2</sup> = 24')} and ${eq('x + y = 6')}. What is x − y?`,
        kind: 'num',
        answer: '4',
        show: 'x − y = 4',
        idea: 'Factor first: x<sup>2</sup> − y<sup>2</sup> = (x + y)(x − y).',
        steps: [
          '(x + y)(x − y) = 24.',
          '6(x − y) = 24, so x − y = 4.'
        ],
        hint: 'Factor x² − y².'
      },
      {
        id: 'landing',
        title: 'Touchdown',
        prompt: `A ball's height in feet after t seconds is ${eq('h = −16t<sup>2</sup> + 32t + 48')}. After how many seconds does it hit the ground?`,
        kind: 'num',
        answer: '3',
        show: '3 seconds',
        idea: 'Hitting the ground means h = 0. Time cannot be negative.',
        steps: [
          '−16t<sup>2</sup> + 32t + 48 = 0. Divide by −16: t<sup>2</sup> − 2t − 3 = 0.',
          '(t − 3)(t + 1) = 0, so t = 3 or t = −1.',
          'Time cannot be negative, so t = 3.'
        ],
        hint: 'Set h = 0 and divide everything by −16 first.'
      },
      {
        id: 'peak',
        title: 'Top of the arc',
        prompt: `Same ball, ${eq('h = −16t<sup>2</sup> + 32t + 48')}. What is the greatest height it reaches?`,
        kind: 'num',
        answer: '64',
        show: '64 feet',
        idea: 'The highest point of a downward parabola is its vertex.',
        steps: [
          `Vertex: t = −${F(32, '2(−16)')} = 1.`,
          'h = −16 + 32 + 48 = 64.'
        ],
        hint: 'Find the vertex time with t = −b/(2a), then plug it in.'
      }
    ]
  };

  const exponents = {
    title: 'Exponents & patterns',
    blurb: 'Exponent rules, sequences, and growth.',
    puzzles: [
      {
        id: 'powers',
        title: 'Stack and divide',
        prompt: `What is ${eq(`${F('2<sup>10</sup> · 2<sup>5</sup>', '2<sup>12</sup>')}`)}?`,
        kind: 'num',
        answer: '8',
        show: '8',
        idea: 'Multiplying adds exponents. Dividing subtracts them.',
        steps: [
          '2<sup>10</sup> · 2<sup>5</sup> = 2<sup>15</sup>.',
          '2<sup>15</sup> ÷ 2<sup>12</sup> = 2<sup>3</sup> = 8.'
        ],
        hint: 'Combine the exponents before computing anything.'
      },
      {
        id: 'powpow',
        title: 'Power of a power',
        prompt: `Simplify ${eq('(x<sup>3</sup>)<sup>4</sup> ÷ x<sup>10</sup>')}.`,
        kind: 'expr',
        answer: 'x^2',
        show: 'x<sup>2</sup>',
        idea: 'A power of a power multiplies the exponents.',
        steps: [
          '(x<sup>3</sup>)<sup>4</sup> = x<sup>12</sup>.',
          'x<sup>12</sup> ÷ x<sup>10</sup> = x<sup>2</sup>.'
        ],
        hint: 'Type powers with ^, like x^5.'
      },
      {
        id: 'nine',
        title: 'Same base',
        prompt: `If ${eq('3<sup>a</sup> = 5')}, what is ${eq('9<sup>a</sup>')}?`,
        kind: 'num',
        answer: '25',
        show: '25',
        idea: 'Rewrite with the same base: 9 = 3<sup>2</sup>.',
        steps: [
          '9<sup>a</sup> = (3<sup>2</sup>)<sup>a</sup> = (3<sup>a</sup>)<sup>2</sup>.',
          '(3<sup>a</sup>)<sup>2</sup> = 5<sup>2</sup> = 25.'
        ],
        hint: 'You never need to find a. Write 9 as a power of 3.'
      },
      {
        id: 'negexp',
        title: 'Negative exponent',
        prompt: `What is ${eq('2<sup>−3</sup> · 4<sup>2</sup>')}?`,
        kind: 'num',
        answer: '2',
        show: '2',
        idea: `A negative exponent means a reciprocal: 2<sup>−3</sup> = ${F(1, 8)}.`,
        steps: [
          `2<sup>−3</sup> = ${F(1, 8)} and 4<sup>2</sup> = 16.`,
          `${F(16, 8)} = 2.`
        ],
        hint: '2 to the −3 is 1 over 2 to the 3.'
      },
      {
        id: 'biggest',
        title: 'Biggest one',
        prompt: 'Which of these is largest?',
        kind: 'choice',
        choices: ['2<sup>30</sup>', '3<sup>20</sup>', '4<sup>14</sup>', '8<sup>9</sup>'],
        answer: 1,
        show: '3<sup>20</sup>',
        idea: 'Rewrite powers with the same base or the same exponent to compare them.',
        steps: [
          '4<sup>14</sup> = 2<sup>28</sup> and 8<sup>9</sup> = 2<sup>27</sup>, both smaller than 2<sup>30</sup>.',
          '2<sup>30</sup> = 8<sup>10</sup> and 3<sup>20</sup> = 9<sup>10</sup>. Since 9 > 8, 3<sup>20</sup> wins.'
        ],
        hint: 'Write the powers of 2 with base 2. For 3²⁰, try making the exponent 10.'
      },
      {
        id: 'arith',
        title: 'Fiftieth term',
        prompt: 'The sequence 7, 11, 15, 19, … keeps adding 4. What is the 50th term?',
        kind: 'num',
        answer: '203',
        show: '203',
        idea: 'The nth term of an arithmetic sequence is a + (n − 1)d.',
        steps: [
          'Getting to the 50th term takes 49 steps of 4.',
          '7 + 49 × 4 = 7 + 196 = 203.'
        ],
        hint: 'How many times do you add 4 to get from the 1st term to the 50th?'
      },
      {
        id: 'geo',
        title: 'Which term',
        prompt: 'The sequence 3, 6, 12, 24, … doubles each time. Which term is 384?',
        kind: 'num',
        answer: '8',
        show: 'the 8th term',
        idea: 'The nth term of a geometric sequence is a · r<sup>n − 1</sup>.',
        steps: [
          '3 · 2<sup>n − 1</sup> = 384, so 2<sup>n − 1</sup> = 128 = 2<sup>7</sup>.',
          'n − 1 = 7, so n = 8.'
        ],
        hint: 'Divide 384 by 3. What power of 2 is left?'
      },
      {
        id: 'bacteria',
        title: 'Doubling',
        prompt: 'A bacteria colony starts at 50 and doubles every 3 hours. How many bacteria are there after 12 hours?',
        kind: 'num',
        answer: '800',
        show: '800',
        idea: 'Exponential growth multiplies by the same factor each period.',
        steps: [
          '12 hours is 4 doubling periods.',
          '50 · 2<sup>4</sup> = 50 · 16 = 800.'
        ],
        hint: 'How many times does it double in 12 hours?'
      },
      {
        id: 'lastdigit',
        title: 'Last digit',
        prompt: `What is the ones digit of ${eq('3<sup>100</sup>')}?`,
        kind: 'num',
        answer: '1',
        show: '1',
        idea: 'Ones digits of powers repeat in a cycle.',
        steps: [
          '3, 9, 27, 81, 243, … have ones digits 3, 9, 7, 1, 3, …, a cycle of 4.',
          '100 is a multiple of 4, so 3<sup>100</sup> ends like 3<sup>4</sup>, in 1.'
        ],
        hint: 'Write out the ones digits of 3¹, 3², 3³, 3⁴, 3⁵ and look for a repeat.'
      },
      {
        id: 'oddsum',
        title: 'Odd stack',
        prompt: 'What is 1 + 3 + 5 + … + 39?',
        kind: 'num',
        answer: '400',
        show: '400',
        idea: 'The first n odd numbers add up to n<sup>2</sup>.',
        steps: [
          '1 = 1, 1 + 3 = 4, 1 + 3 + 5 = 9: the sums are perfect squares.',
          '39 is the 20th odd number, so the sum is 20<sup>2</sup> = 400.'
        ],
        hint: 'Add the first few: 1, then 1 + 3, then 1 + 3 + 5. What do you notice?'
      }
    ]
  };

  const functions = {
    title: 'Functions',
    blurb: 'Inputs, outputs, and moving graphs around.',
    puzzles: [
      {
        id: 'backward',
        title: 'Work backward',
        prompt: `${eq('f(x) = 3x − 2')}. If ${eq('f(a) = 13')}, what is a?`,
        kind: 'num',
        answer: '5',
        show: 'a = 5',
        idea: 'Knowing the output means solving an equation for the input.',
        steps: [
          '3a − 2 = 13.',
          '3a = 15, so a = 5.'
        ],
        hint: 'Replace x with a and set the result equal to 13.'
      },
      {
        id: 'twice',
        title: 'Twice over',
        prompt: `${eq('f(x) = 2x + 1')}. What is ${eq('f(f(3))')}?`,
        kind: 'num',
        answer: '15',
        show: '15',
        idea: 'Work from the inside out: the first output becomes the next input.',
        steps: [
          'f(3) = 7.',
          'f(7) = 15.'
        ],
        hint: 'Find f(3) first.'
      },
      {
        id: 'rule',
        title: 'Find the rule',
        prompt: 'A linear function gives f(1) = 5, f(2) = 8, and f(3) = 11. Write f(x).',
        kind: 'expr',
        answer: '3x+2',
        show: 'f(x) = 3x + 2',
        idea: 'The amount the output grows per step of 1 is the slope.',
        steps: [
          'Each step of 1 in x adds 3 to the output, so the slope is 3.',
          'f(0) would be 5 − 3 = 2, so f(x) = 3x + 2.'
        ],
        hint: 'Type just the right side, like 4x − 1.'
      },
      {
        id: 'predict',
        title: 'Predict it',
        prompt: 'A linear function has f(2) = 7 and f(6) = 19. What is f(10)?',
        kind: 'num',
        answer: '31',
        show: '31',
        idea: 'A linear function changes by the same amount for equal steps in x.',
        steps: [
          'From x = 2 to x = 6 the output grows by 12, which is 3 per unit.',
          'From x = 6 to x = 10 it grows another 12: 19 + 12 = 31.'
        ],
        hint: 'x goes up by 4 from 6 to 10, the same as from 2 to 6.'
      },
      {
        id: 'notfn',
        title: 'Not a function',
        prompt: 'Which of these is not a function of x?',
        kind: 'choice',
        choices: [
          '{(1, 2), (2, 3), (3, 2)}',
          '{(1, 2), (1, 3), (2, 4)}',
          'y = x<sup>2</sup>',
          'y = |x|'
        ],
        answer: 1,
        show: '{(1, 2), (1, 3), (2, 4)}',
        idea: 'A function gives each input exactly one output. Repeated outputs are fine.',
        steps: [
          'In the second set, the input 1 goes to both 2 and 3.',
          'The first set repeats the output 2, which is allowed.'
        ],
        hint: 'Look for an input that goes to two different outputs.'
      },
      {
        id: 'square8',
        title: 'Two inputs',
        prompt: `${eq('f(x) = x<sup>2</sup> − 1')}. For which x is ${eq('f(x) = 8')}? Give every answer.`,
        kind: 'list',
        answer: '3, -3',
        show: 'x = 3 or x = −3',
        idea: 'A function can send two different inputs to the same output.',
        steps: [
          'x<sup>2</sup> − 1 = 8, so x<sup>2</sup> = 9.',
          'x = 3 or x = −3.'
        ],
        hint: 'x² = 9 has more than one answer.'
      },
      {
        id: 'compose',
        title: 'Order matters',
        prompt: `${eq('f(x) = x + 4')} and ${eq('g(x) = 2x')}. Simplify ${eq('f(g(x)) − g(f(x))')}.`,
        kind: 'expr',
        answer: '-4',
        show: '−4',
        idea: 'f(g(x)) and g(f(x)) are usually different.',
        steps: [
          'f(g(x)) = 2x + 4.',
          'g(f(x)) = 2(x + 4) = 2x + 8.',
          '(2x + 4) − (2x + 8) = −4.'
        ],
        hint: 'Work out f(g(x)) and g(f(x)) separately, then subtract.'
      },
      {
        id: 'reflect',
        title: 'Mirror image',
        prompt: `The gray line is ${eq('y = 2x + 1')}. Draw its reflection across the y-axis.`,
        kind: 'line',
        board: { given: { m: 2, b: 1 } },
        answer: { m: m(-2), b: 1 },
        idea: 'Reflecting across the y-axis replaces x with −x.',
        steps: [
          'y = 2(−x) + 1 = −2x + 1.',
          'The intercept stays at (0, 1) because it sits on the mirror.'
        ],
        hint: 'Which point on the gray line does not move? What happens to the slope?'
      },
      {
        id: 'slide',
        title: 'Slide right',
        prompt: `The gray line is ${eq(`y = ${F(1, 2)}x − 1`)}. Slide it 4 units to the right and draw the result.`,
        kind: 'line',
        board: { given: { m: 0.5, b: -1 } },
        answer: { m: m(1, 2), b: -3 },
        idea: 'Shifting right by 4 replaces x with x − 4.',
        steps: [
          `y = ${F(1, 2)}(x − 4) − 1 = ${F(1, 2)}x − 3.`,
          'Check: (0, −1) moves to (4, −1), and ½(4) − 3 = −1.'
        ],
        hint: 'Move two points of the gray line 4 to the right and connect them.'
      },
      {
        id: 'maxout',
        title: 'Biggest output',
        prompt: `${eq('f(x) = −2x + 5')} with domain ${eq('0 ≤ x ≤ 4')}. What is the largest output?`,
        kind: 'num',
        answer: '5',
        show: '5',
        idea: 'A line with negative slope is highest at the left end of its domain.',
        steps: [
          'The slope is negative, so f gets smaller as x grows.',
          'The largest output is at x = 0: f(0) = 5.'
        ],
        hint: 'Is f going up or down as x increases?'
      }
    ]
  };

  const word = {
    title: 'Think it through',
    blurb: 'Word problems where the setup is the hard part.',
    puzzles: [
      {
        id: 'evens',
        title: 'Three evens',
        prompt: 'The sum of three consecutive even integers is 102. What is the largest one?',
        kind: 'num',
        answer: '36',
        show: '36',
        idea: 'Consecutive even integers are n, n + 2, n + 4.',
        steps: [
          'n + (n + 2) + (n + 4) = 102, so 3n + 6 = 102 and n = 32.',
          'The integers are 32, 34, 36.'
        ],
        hint: 'Call the smallest n. The next even integer is n + 2.'
      },
      {
        id: 'average',
        title: 'Last test',
        prompt: 'Your first three test scores are 82, 90, and 77. What do you need on the fourth test to average exactly 85?',
        kind: 'num',
        answer: '91',
        show: '91',
        idea: 'An average of 85 over 4 tests means a total of 340.',
        steps: [
          '4 × 85 = 340 points needed in total.',
          '82 + 90 + 77 = 249, so you need 340 − 249 = 91.'
        ],
        hint: 'What total do four tests need to average 85?'
      },
      {
        id: 'mixture',
        title: 'Water it down',
        prompt: 'You have 6 liters of drink that is 40% juice. How many liters of water should you add to make it 30% juice?',
        kind: 'num',
        answer: '2',
        show: '2 liters',
        idea: 'Adding water changes the total but not the amount of juice.',
        steps: [
          'Juice: 40% of 6 = 2.4 liters, and that stays fixed.',
          '2.4 = 0.3(6 + w), so 6 + w = 8 and w = 2.'
        ],
        hint: 'How many liters of juice are there? That number does not change.'
      },
      {
        id: 'paint',
        title: 'Work together',
        prompt: 'Ana can paint a fence in 6 hours. Ben can paint it in 3 hours. How many hours does it take them working together?',
        kind: 'num',
        answer: '2',
        show: '2 hours',
        idea: 'Add rates, not times.',
        steps: [
          `Ana paints ${F(1, 6)} of the fence per hour, Ben ${F(1, 3)}.`,
          `Together: ${F(1, 6)} + ${F(2, 6)} = ${F(1, 2)} per hour, so 2 hours.`
        ],
        hint: 'What fraction of the fence does each person paint in one hour?'
      },
      {
        id: 'cyclists',
        title: 'Head on',
        prompt: 'Two cyclists start 60 miles apart and ride toward each other, one at 12 mph and one at 18 mph. How many hours until they meet?',
        kind: 'num',
        answer: '2',
        show: '2 hours',
        idea: 'Moving toward each other, the gap closes at the sum of the speeds.',
        steps: [
          'The gap shrinks by 12 + 18 = 30 miles each hour.',
          '60 ÷ 30 = 2 hours.'
        ],
        hint: 'How much does the distance between them shrink each hour?'
      },
      {
        id: 'ages',
        title: 'Ages',
        prompt: 'Maya is 3 times as old as her brother. In 6 years, she will be twice as old as he is. How old is Maya now?',
        kind: 'num',
        answer: '18',
        show: '18',
        idea: 'Both people age by the same amount.',
        steps: [
          'Brother: b, Maya: 3b. In 6 years: 3b + 6 = 2(b + 6).',
          '3b + 6 = 2b + 12, so b = 6 and Maya is 18.',
          'Check: in 6 years, 24 = 2 × 12.'
        ],
        hint: 'Add 6 to both ages, not just Maya’s.'
      },
      {
        id: 'digits',
        title: 'Flip the digits',
        prompt: 'A two-digit number has digits that add to 11. Reversing its digits makes a number 27 larger. What is the original number?',
        kind: 'num',
        answer: '47',
        show: '47',
        idea: 'A two-digit number with digits a and b is 10a + b.',
        steps: [
          'a + b = 11, and (10b + a) − (10a + b) = 27, so 9(b − a) = 27 and b − a = 3.',
          'b = 7 and a = 4, so the number is 47. Check: 74 − 47 = 27.'
        ],
        hint: 'Write the number as 10a + b and the reversed number as 10b + a.'
      },
      {
        id: 'plans',
        title: 'Break even',
        prompt: 'Plan A costs $30 a month plus $0.10 per minute. Plan B costs $45 a month plus $0.05 per minute. At how many minutes do they cost the same?',
        kind: 'num',
        answer: '300',
        show: '300 minutes',
        idea: 'The break-even point is where the two cost lines intersect.',
        steps: [
          '30 + 0.10m = 45 + 0.05m.',
          '0.05m = 15, so m = 300. Both cost $60.'
        ],
        hint: 'Set the two costs equal.'
      },
      {
        id: 'handshakes',
        title: 'Handshakes',
        prompt: 'At a party, everyone shakes hands with everyone else exactly once. There are 45 handshakes. How many people are at the party?',
        kind: 'num',
        answer: '10',
        show: '10 people',
        idea: `With n people there are ${F('n(n − 1)', 2)} handshakes, a quadratic.`,
        steps: [
          `Each of n people shakes n − 1 hands, but that counts every handshake twice: ${F('n(n − 1)', 2)} = 45.`,
          'n(n − 1) = 90 = 10 × 9, so n = 10.'
        ],
        hint: 'Each person shakes hands with everyone but themselves. Did you count each handshake twice?'
      },
      {
        id: 'recip',
        title: 'Square it',
        prompt: `${eq(`x + ${F(1, 'x')} = 5`)}. What is ${eq(`x<sup>2</sup> + ${F(1, 'x<sup>2</sup>')}`)}?`,
        kind: 'num',
        answer: '23',
        show: '23',
        idea: 'Squaring a sum creates a middle term you can predict.',
        steps: [
          `(x + ${F(1, 'x')})<sup>2</sup> = x<sup>2</sup> + 2 + ${F(1, 'x<sup>2</sup>')}.`,
          `25 = x<sup>2</sup> + 2 + ${F(1, 'x<sup>2</sup>')}, so the answer is 23.`
        ],
        hint: 'Square both sides. The middle term of the square is simpler than it looks.'
      }
    ]
  };

  return [lines, systems, inequalities, quadratics, exponents, functions, word];
})();
