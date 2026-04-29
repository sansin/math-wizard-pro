-- ───────────────────────────────────────────────────────────────────────
-- Seed: skill catalog
--
-- A curated graph aligned roughly to Common Core / typical K-12 sequencing.
-- Each row is a fine-grained skill that the mastery model tracks
-- independently (e.g., "addition" is split into single-digit, two-digit,
-- regrouping, etc.).
-- ───────────────────────────────────────────────────────────────────────

insert into public.skills (id, name, module, topic, grade_band, intrinsic_difficulty, prerequisites, standards) values
-- ─── K-1 ───────────────────────────────────────────────────────────────
('k1.count.to10',            'Count to 10',                'Number Sense', 'Counting',           'K-1', 1, '{}', '{K.CC.A.1}'),
('k1.count.to20',            'Count to 20',                'Number Sense', 'Counting',           'K-1', 2, '{k1.count.to10}', '{K.CC.A.1}'),
('k1.compare.numbers',       'Compare numbers',            'Number Sense', 'Comparing',          'K-1', 2, '{k1.count.to20}', '{K.CC.C.6}'),
('k1.add.single',            'Single-digit addition',      'Addition',     'Single-digit',       'K-1', 2, '{k1.count.to10}', '{K.OA.A.5}'),
('k1.sub.single',            'Single-digit subtraction',   'Subtraction',  'Single-digit',       'K-1', 2, '{k1.count.to10}', '{K.OA.A.5}'),
('k1.add.to20',              'Addition within 20',         'Addition',     'Within 20',          'K-1', 3, '{k1.add.single}', '{1.OA.C.6}'),
('k1.sub.to20',              'Subtraction within 20',      'Subtraction',  'Within 20',          'K-1', 3, '{k1.sub.single}', '{1.OA.C.6}'),
('k1.shapes.basic',          'Identify basic shapes',      'Geometry',     'Shapes',             'K-1', 1, '{}', '{K.G.A.2}'),
('k1.patterns',              'Simple patterns',            'Logic',        'Patterns',           'K-1', 2, '{}', '{}'),

-- ─── 2-3 ───────────────────────────────────────────────────────────────
('g23.add.2digit',           'Two-digit addition',         'Addition',     'Multi-digit',        '2-3', 2, '{k1.add.to20}', '{2.NBT.B.5}'),
('g23.add.regroup',          'Addition with regrouping',   'Addition',     'Regrouping',         '2-3', 3, '{g23.add.2digit}', '{2.NBT.B.7}'),
('g23.sub.2digit',            'Two-digit subtraction',     'Subtraction',  'Multi-digit',        '2-3', 2, '{k1.sub.to20}', '{2.NBT.B.5}'),
('g23.sub.regroup',          'Subtraction with regrouping','Subtraction',  'Regrouping',         '2-3', 3, '{g23.sub.2digit}', '{2.NBT.B.7}'),
('g23.mult.tables',          'Multiplication tables 2-10','Multiplication','Times tables',       '2-3', 3, '{}', '{3.OA.C.7}'),
('g23.div.basic',            'Basic division facts',       'Division',     'Division facts',     '2-3', 3, '{g23.mult.tables}', '{3.OA.C.7}'),
('g23.frac.intro',           'Introduction to fractions',  'Fractions',    'Halves & quarters',  '2-3', 2, '{}', '{3.NF.A.1}'),
('g23.measure.length',       'Length measurement',         'Measurement',  'Length',             '2-3', 2, '{}', '{2.MD.A.1}'),
('g23.time.read',            'Reading time',               'Measurement',  'Time',               '2-3', 2, '{}', '{2.MD.C.7}'),
('g23.geo.perimeter',        'Perimeter of polygons',      'Geometry',     'Perimeter',          '2-3', 3, '{g23.add.2digit}', '{3.MD.D.8}'),

-- ─── 4-5 ───────────────────────────────────────────────────────────────
('g45.mult.multidigit',      'Multi-digit multiplication', 'Multiplication','Multi-digit',       '4-5', 3, '{g23.mult.tables}', '{4.NBT.B.5}'),
('g45.div.long',             'Long division',              'Division',     'Long division',      '4-5', 4, '{g45.mult.multidigit}', '{5.NBT.B.6}'),
('g45.frac.add',             'Add and subtract fractions', 'Fractions',    'Add/subtract',       '4-5', 3, '{g23.frac.intro}', '{4.NF.B.3}'),
('g45.frac.mult',            'Multiply fractions',         'Fractions',    'Multiplication',     '4-5', 3, '{g45.frac.add}', '{5.NF.B.4}'),
('g45.frac.div',             'Divide fractions',           'Fractions',    'Division',           '4-5', 4, '{g45.frac.mult}', '{5.NF.B.7}'),
('g45.dec.intro',            'Decimals: place value',      'Decimals',     'Place value',        '4-5', 2, '{}', '{5.NBT.A.3}'),
('g45.dec.ops',              'Decimal arithmetic',         'Decimals',     'Operations',         '4-5', 3, '{g45.dec.intro}', '{5.NBT.B.7}'),
('g45.geo.area',             'Area of rectangles',         'Geometry',     'Area',               '4-5', 3, '{g23.geo.perimeter}', '{4.MD.A.3}'),
('g45.geo.volume',           'Volume basics',              'Geometry',     'Volume',             '4-5', 4, '{g45.geo.area}', '{5.MD.C.5}'),
('g45.alg.expr',             'Variables & expressions',    'Pre-Algebra',  'Expressions',        '4-5', 3, '{}', '{5.OA.A.2}'),
('g45.stats.mean',           'Mean and median',            'Statistics',   'Center',             '4-5', 3, '{g23.add.regroup}', '{6.SP.B.5}'),

-- ─── 6-7 ───────────────────────────────────────────────────────────────
('g67.numb.gcd',             'GCD and LCM',                'Number Theory','Factors',            '6-7', 3, '{g23.mult.tables}', '{6.NS.B.4}'),
('g67.frac.percent',         'Percentages',                'Fractions',    'Percentages',        '6-7', 3, '{g45.frac.mult}', '{6.RP.A.3}'),
('g67.ratio.proportion',     'Ratios & proportions',       'Ratios',       'Proportions',        '6-7', 3, '{g67.frac.percent}', '{6.RP.A.1}'),
('g67.alg.linear',           'One-step linear equations',  'Algebra',      'Linear equations',   '6-7', 3, '{g45.alg.expr}', '{6.EE.B.7}'),
('g67.alg.twostep',          'Two-step linear equations',  'Algebra',      'Linear equations',   '6-7', 4, '{g67.alg.linear}', '{7.EE.B.4}'),
('g67.alg.inequalities',     'Inequalities',               'Algebra',      'Inequalities',       '6-7', 4, '{g67.alg.linear}', '{6.EE.B.8}'),
('g67.geo.angles',           'Angle relationships',        'Geometry',     'Angles',             '6-7', 3, '{}', '{7.G.B.5}'),
('g67.geo.surface',          'Surface area & volume',      'Geometry',     'Surface area',       '6-7', 4, '{g45.geo.volume}', '{7.G.B.6}'),
('g67.stats.distrib',        'Mean, median, mode, range',  'Statistics',   'Center & spread',    '6-7', 3, '{g45.stats.mean}', '{6.SP.B.5}'),
('g67.prob.basic',           'Basic probability',          'Probability',  'Simple events',      '6-7', 3, '{g67.frac.percent}', '{7.SP.C.5}'),

-- ─── 8-9 ───────────────────────────────────────────────────────────────
('g89.alg.systems',          'Systems of equations',       'Algebra',      'Systems',            '8-9', 4, '{g67.alg.twostep}', '{8.EE.C.8}'),
('g89.alg.quadratic',        'Quadratic equations',        'Algebra',      'Quadratics',         '8-9', 5, '{g89.alg.systems}', '{A-REI.B.4}'),
('g89.alg.factor',           'Factoring polynomials',      'Algebra',      'Factoring',          '8-9', 4, '{g89.alg.systems}', '{A-SSE.A.2}'),
('g89.exp.laws',             'Exponent laws',              'Exponents',    'Laws',               '8-9', 3, '{}', '{8.EE.A.1}'),
('g89.exp.scientific',       'Scientific notation',        'Exponents',    'Scientific notation','8-9', 3, '{g89.exp.laws}', '{8.EE.A.4}'),
('g89.func.linear',          'Linear functions',           'Functions',    'Linear',             '8-9', 4, '{g67.alg.twostep}', '{8.F.A.2}'),
('g89.func.slope',           'Slope and intercepts',       'Functions',    'Slope',              '8-9', 4, '{g89.func.linear}', '{8.F.B.4}'),
('g89.geo.pythag',           'Pythagorean theorem',        'Geometry',     'Pythagorean',        '8-9', 4, '{g89.exp.laws}', '{8.G.B.7}'),
('g89.geo.transform',        'Transformations',            'Geometry',     'Transformations',    '8-9', 4, '{}', '{8.G.A.1}'),
('g89.stats.scatter',        'Scatter plots & regression', 'Statistics',   'Bivariate',          '8-9', 4, '{g89.func.linear}', '{8.SP.A.1}'),

-- ─── 10-12 ─────────────────────────────────────────────────────────────
('g1012.alg.rational',       'Rational expressions',       'Algebra',      'Rational',           '10-12', 5, '{g89.alg.factor}', '{A-APR.D.6}'),
('g1012.alg.exp_log',        'Exponential & log functions','Functions',    'Exp & log',          '10-12', 5, '{g89.exp.laws}', '{F-IF.C.7}'),
('g1012.func.composition',   'Function composition',       'Functions',    'Composition',        '10-12', 4, '{g89.func.linear}', '{F-BF.A.1}'),
('g1012.func.inverse',       'Inverse functions',          'Functions',    'Inverses',           '10-12', 4, '{g1012.func.composition}', '{F-BF.B.4}'),
('g1012.trig.basic',         'Right triangle trigonometry','Trigonometry', 'Right triangles',    '10-12', 4, '{g89.geo.pythag}', '{G-SRT.C.6}'),
('g1012.trig.unit',          'Unit circle',                'Trigonometry', 'Unit circle',        '10-12', 5, '{g1012.trig.basic}', '{F-TF.A.2}'),
('g1012.trig.identities',    'Trig identities',            'Trigonometry', 'Identities',         '10-12', 5, '{g1012.trig.unit}', '{F-TF.C.8}'),
('g1012.calc.limits',        'Limits',                     'Calculus',     'Limits',             '10-12', 4, '{g1012.func.composition}', '{}'),
('g1012.calc.deriv',         'Derivatives',                'Calculus',     'Derivatives',        '10-12', 5, '{g1012.calc.limits}', '{}'),
('g1012.calc.integrate',     'Integration',                'Calculus',     'Integration',        '10-12', 5, '{g1012.calc.deriv}', '{}'),
('g1012.stats.normal',       'Normal distribution',        'Statistics',   'Distributions',      '10-12', 4, '{g89.stats.scatter}', '{S-ID.A.4}'),
('g1012.stats.testing',      'Hypothesis testing',         'Statistics',   'Inference',          '10-12', 5, '{g1012.stats.normal}', '{S-IC.B.4}')
on conflict (id) do nothing;
