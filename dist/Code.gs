/**
 * StudyTwin — bundled server code.
 *
 * GENERATED FILE. Every section below is one file from src/ in the repository.
 * Do not edit this in the Apps Script editor: regenerate it with `npm run bundle`
 * and paste it again, or the next rebuild will silently discard your change.
 *
 * Built: 2026-09-17T13:52:33.658Z
 */

/* ==========================================================================
 * Config.gs
 * ========================================================================== */

/**
 * Central configuration.
 *
 * Nothing secret lives here. The one environment-specific value — the ID of the
 * spreadsheet used as the datastore — is held in Script Properties so this file
 * stays identical across the dev and live deployments.
 */

const CONFIG = {
  /** Only accounts on this domain may use the app. Enforced server-side on every call. */
  ALLOWED_DOMAIN: 'aisa.sch.ae',

  /** Display name of the platform, shown in the UI header. */
  APP_NAME: 'StudyTwin',
  SCHOOL_NAME: 'American International School in Abu Dhabi',

  /** Script Property key holding the datastore spreadsheet ID. */
  PROP_SPREADSHEET_ID: 'STUDYTWIN_SPREADSHEET_ID',

  /**
   * Attainment levels, from the ADEK K–12 AI Fluency Framework.
   *
   * These are CRITERION-REFERENCED levels awarded by a teacher against a written
   * descriptor. They are not score bands: no percentage threshold exists for any
   * of them anywhere in ADEK's published material, and none may be invented.
   *
   * `working_towards` is the published Teacher Packs' term for not yet meeting
   * Emerging. Their wording matters and is reproduced in the UI: it is
   * "diagnostic information, not a failure".
   *
   * Note that Emerging is the EXPECTED standard in Term 1 for Grades 6 and 7 —
   * it is the top of the scale for that term, not the bottom. Colours reflect
   * that: nothing below Advanced is rendered as a warning.
   */
  ATTAINMENT_LEVELS: [
    { key: 'working_towards', label: 'Working towards', letter: '—', ordinal: 0,
      isTier: false, color: '#9AA0A8',
      note: 'Diagnostic information, not a failure. Use the linked bridging content, then re-check.' },
    { key: 'emerging', label: 'Emerging', letter: 'E', ordinal: 1,
      isTier: true, color: '#8A76D0',
      note: 'The expected standard for Term 1.' },
    { key: 'proficient', label: 'Proficient', letter: 'P', ordinal: 2,
      isTier: true, color: '#21076C',
      note: 'The national entitlement standard; the target for the full year.' },
    { key: 'advanced', label: 'Advanced', letter: 'A', ordinal: 3,
      isTier: true, color: '#D8B664',
      note: 'Further stretch, and the prior-grade bar that Bridging rebuilds.' }
  ],

  /**
   * Overall-level decision rules, per grade, taken verbatim from each grade's
   * published Final Assessment.
   *
   * These genuinely differ between grades and must not be shared:
   *   - Grade 6 Emerging allows one strand below Emerging (3 of 4 suffice).
   *   - Grade 7 Emerging requires every strand at Emerging or above.
   *   - Grade 8's EXPECTED tier is Proficient, not Emerging, and its Proficient
   *     rule carries no floor condition.
   *
   * Rules are evaluated top-down; the first whose conditions hold is awarded.
   *   atOrAbove — at least `count` strands at `level` or above
   *   floor     — every strand must be at this level or above (null = no floor)
   */
  GRADE_RULES: {
    grade6: {
      expectedTier: 'emerging',
      source: 'Grade 6 Final Assessment, Module 8 — Analytic rubric, overall level judgement',
      rules: [
        { level: 'advanced',   atOrAbove: { level: 'advanced',   count: 3 }, floor: 'proficient',
          text: 'At least 3 strands at Advanced, with no strand below Proficient.' },
        { level: 'proficient', atOrAbove: { level: 'proficient', count: 3 }, floor: 'emerging',
          text: 'At least 3 of 4 strands at Proficient or above, with none below Emerging.' },
        { level: 'emerging',   atOrAbove: { level: 'emerging',   count: 3 }, floor: null,
          text: 'At least 3 of 4 strands at Emerging or above.' }
      ]
    },
    grade7: {
      expectedTier: 'emerging',
      source: 'Grade 7 Final Assessment, Module 9 — Analytic rubric, overall level judgement',
      rules: [
        { level: 'advanced',   atOrAbove: { level: 'advanced',   count: 3 }, floor: 'proficient',
          text: 'At least 3 strands at Advanced, with no strand below Proficient.' },
        { level: 'proficient', atOrAbove: { level: 'proficient', count: 3 }, floor: 'emerging',
          text: 'At least 3 of 4 strands at Proficient or above, none below Emerging.' },
        { level: 'emerging',   atOrAbove: { level: 'emerging',   count: 4 }, floor: 'emerging',
          text: '0–2 strands at Proficient, the rest at Emerging.' }
      ]
    },
    grade8: {
      expectedTier: 'proficient',
      source: 'Grade 8 Final Assessment, Module 10 — Analytic rubric, overall level judgement',
      rules: [
        { level: 'advanced',   atOrAbove: { level: 'advanced',   count: 3 }, floor: 'proficient',
          text: 'At least 3 strands at Advanced, with no strand below Proficient.' },
        { level: 'proficient', atOrAbove: { level: 'proficient', count: 3 }, floor: null,
          text: 'At least 3 of 4 strands at Proficient or above.' },
        { level: 'emerging',   atOrAbove: { level: 'emerging',   count: 4 }, floor: 'emerging',
          text: '0–2 strands at Proficient, the rest at Emerging.' }
      ]
    }
  },

  /**
   * The three scales in use. They sit on different continua and must never be
   * rolled into one another — only `summative_tier` is reportable attainment.
   */
  SCALES: {
    summative_tier: ['working_towards', 'emerging', 'proficient', 'advanced'],
    formative_criterion: ['not_yet', 'approaching', 'emerging'],
    bridging_readiness: ['not_yet', 'partial', 'mastery']
  },

  /** The four strands of Phase 3. Codes are stable; labels vary by grade. */
  STRANDS: ['CU', 'SD', 'CE', 'GE'],

  /** Evidence sources ADEK requires judgements to triangulate across. */
  EVIDENCE_SOURCES: [
    { key: 'products',     label: 'Products',     hint: 'what students make' },
    { key: 'observations', label: 'Observations', hint: 'what students do' },
    { key: 'conversations', label: 'Conversations', hint: 'what students say' }
  ],

  /** Students may retry a worksheet up to this many times. */
  MAX_ATTEMPTS: 3,

  /** Seconds to cache curriculum + roster lookups. Content is static; identity is not. */
  CACHE_SECONDS: 300
};

/** Sheet names used in the datastore workbook. */
const SHEETS = {
  STAFF: 'Staff',
  ROSTER: 'Roster',
  PROGRESS: 'Progress',
  SUBMISSIONS: 'Submissions',
  JUDGEMENTS: 'Judgements',
  READINESS: 'Readiness',
  AUDIT: 'AuditLog'
};

/**
 * Column order for each sheet. Changing these means migrating the workbook.
 *
 * JUDGEMENTS is the ADEK observation record: one row per strand per assessment
 * event, append-only so a re-check after bridging leaves an audit trail rather
 * than overwriting the earlier judgement.
 */
const COLUMNS = {
  STAFF:       ['email', 'role', 'displayName', 'addedAt', 'addedBy'],
  ROSTER:      ['email', 'displayName', 'grade', 'className', 'active', 'bridgingStrands'],
  PROGRESS:    ['email', 'lessonId', 'track', 'weekNumber', 'status',
                'startedAt', 'updatedAt', 'submittedAt'],
  SUBMISSIONS: ['email', 'lessonId', 'track', 'attempt', 'submittedAt', 'marksAwarded',
                'marksAvailable', 'percent', 'answersJson', 'resultsJson'],
  JUDGEMENTS:  ['id', 'email', 'grade', 'track', 'strand', 'level', 'scale',
                'assessmentEvent', 'frameworkRefs',
                'evidenceProducts', 'evidenceObservations', 'evidenceConversations',
                'note', 'accessArrangements', 'nextStep', 'bridgingRef',
                'judgedBy', 'judgedAt', 'supersededBy'],
  READINESS:   ['email', 'grade', 'strand', 'probeCode', 'result', 'action',
                'recheckAfterWeek', 'recordedBy', 'recordedAt'],
  AUDIT:       ['timestamp', 'actor', 'action', 'detail']
};

/** Ordinal lookup, built once from ATTAINMENT_LEVELS. */
const LEVEL_ORDINAL = CONFIG.ATTAINMENT_LEVELS.reduce(function (acc, l) {
  acc[l.key] = l.ordinal;
  return acc;
}, {});

/** Level definition by key. */
function levelDef_(key) {
  return CONFIG.ATTAINMENT_LEVELS.filter(function (l) { return l.key === key; })[0] || null;
}

/* ==========================================================================
 * generated/CurriculumData.gs
 * ========================================================================== */

/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Built from curriculum/** by tools/build-content.js (`npm run build`).
 * Edit the JSON under curriculum/ and rebuild; changes made here are overwritten.
 *
 * Built: 2026-09-17T13:52:33.606Z
 */

const CURRICULUM = {
  "grade6": {
    "meta": {
      "grade": 6,
      "title": "Grade 6 — Artificial Intelligence",
      "subtitle": "ADEK AI Curriculum",
      "provisional": true,
      "note": "Structure and content are placeholders pending the official ADEK Grade 6 curriculum document. Standards codes, lesson titles and worksheet content must be replaced with the published versions before this is used for reporting."
    },
    "units": [
      {
        "id": "g6-u1",
        "title": "Understanding Artificial Intelligence",
        "summary": "What AI is, where students already meet it, and how machines learn from data rather than from rules.",
        "lessons": [
          "g6-l01",
          "g6-l02"
        ]
      }
    ],
    "lessons": {
      "g6-l01": {
        "id": "g6-l01",
        "number": 1,
        "type": "core",
        "title": "What is Artificial Intelligence?",
        "summary": "Meet the difference between a machine that follows rules and a machine that learns.",
        "duration": "45 minutes",
        "objectives": [
          "Define **artificial intelligence** in your own words",
          "Explain how AI is different from an ordinary computer program",
          "Identify at least three examples of AI you already use",
          "Describe what is meant by [[narrow AI]] and [[general AI]]"
        ],
        "sections": [
          {
            "type": "text",
            "heading": "Machines that follow rules",
            "body": [
              "Every computer program is a set of instructions. A calculator adds two numbers because a programmer wrote the rule for adding. A traffic light changes colour because someone wrote the rule for when to change. The machine never decides anything — it follows what it was told, exactly, every single time.",
              "This works brilliantly when the rules are easy to write down. But some problems are almost impossible to write rules for. Try writing the rules for recognising your friend's face. Where do you start? Eye colour? Distance between the eyes? What if they smile, or wear a hat, or stand in the shade?"
            ]
          },
          {
            "type": "text",
            "heading": "Machines that learn",
            "body": [
              "**Artificial intelligence** is what we call it when a machine does something that would normally need human thinking — recognising a face, understanding a sentence, spotting a pattern.",
              "Most modern AI does not work from rules a person wrote. Instead it is shown thousands of examples and finds the patterns by itself. Show a system enough photographs labelled *cat* and *not a cat*, and it works out what makes a cat a cat. Nobody ever writes down the rule. This is called [[machine learning]]."
            ]
          },
          {
            "type": "vocabulary",
            "heading": "Key vocabulary",
            "terms": [
              {
                "term": "Artificial Intelligence (AI)",
                "definition": "A computer system that performs tasks normally needing human intelligence."
              },
              {
                "term": "Machine Learning",
                "definition": "A way of building AI by learning patterns from examples instead of following written rules."
              },
              {
                "term": "Training data",
                "definition": "The examples an AI system learns from."
              },
              {
                "term": "Narrow AI",
                "definition": "AI that is very good at one specific task and cannot do anything else."
              },
              {
                "term": "General AI",
                "definition": "A hypothetical AI that could learn any task a human can. It does not exist yet."
              }
            ]
          },
          {
            "type": "callout",
            "label": "Important",
            "body": [
              "Every AI system that exists today is **narrow AI**. A system that plays chess at world-champion level cannot tell you the weather. A system that recognises faces cannot play chess. General AI — a machine that could do anything a person can — is still science fiction."
            ]
          },
          {
            "type": "list",
            "heading": "AI you already use",
            "items": [
              "**Voice assistants** — turning the sound of your voice into words, then into an action",
              "**Map apps** — predicting which route will be fastest using live traffic patterns",
              "**Video and music apps** — recommending what you might like based on what you watched before",
              "**Camera apps** — finding faces in the frame so the picture stays in focus",
              "**Spam filters** — learning which emails are junk from millions of examples",
              "**Translation apps** — converting one language to another from patterns in translated text"
            ]
          },
          {
            "type": "activity",
            "label": "Class activity",
            "heading": "Rule or pattern?",
            "body": [
              "Work with a partner. For each task below, decide whether a programmer could reasonably write the rules, or whether the machine would need to learn from examples."
            ],
            "items": [
              "Working out change from a 50 dirham note",
              "Deciding whether a photograph contains a camel",
              "Sorting a list of names into alphabetical order",
              "Telling whether a film review is positive or negative",
              "Checking whether a password is at least eight characters long"
            ]
          }
        ],
        "worksheet": {
          "title": "Lesson 1 worksheet",
          "questions": [
            {
              "id": "l01q1",
              "type": "mcq",
              "marks": 2,
              "prompt": "Which of these best describes artificial intelligence?",
              "options": [
                {
                  "id": "a",
                  "text": "Any computer program that runs quickly"
                },
                {
                  "id": "b",
                  "text": "A computer system that performs tasks normally requiring human intelligence"
                },
                {
                  "id": "c",
                  "text": "A robot with arms and legs"
                },
                {
                  "id": "d",
                  "text": "A website that stores a lot of information"
                }
              ],
              "answer": "b",
              "feedback": {
                "correct": "Exactly — it is about the kind of task, not the kind of machine.",
                "incorrect": "AI is defined by what the system does, not by how fast it is or what it looks like."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "E",
                  "code": "AIF·CU·G6·E"
                }
              ],
              "tierProbed": "emerging",
              "evidenceType": "product"
            },
            {
              "id": "l01q2",
              "type": "truefalse",
              "marks": 1,
              "prompt": "General AI — a machine that can learn any task a human can — already exists today.",
              "answer": false,
              "feedback": {
                "correct": "Correct. Every AI system today is narrow AI.",
                "incorrect": "Not quite. General AI does not exist yet; everything today is narrow AI."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "E",
                  "code": "AIF·CU·G6·E"
                }
              ],
              "tierProbed": "emerging",
              "evidenceType": "product"
            },
            {
              "id": "l01q3",
              "type": "multi",
              "marks": 3,
              "prompt": "Select **all** of the everyday tools below that use artificial intelligence.",
              "options": [
                {
                  "id": "a",
                  "text": "A voice assistant that responds when you speak to it"
                },
                {
                  "id": "b",
                  "text": "A calculator app adding two numbers"
                },
                {
                  "id": "c",
                  "text": "A video app recommending what to watch next"
                },
                {
                  "id": "d",
                  "text": "A spam filter deciding which emails are junk"
                },
                {
                  "id": "e",
                  "text": "A digital clock displaying the time"
                }
              ],
              "answer": [
                "a",
                "c",
                "d"
              ],
              "feedback": {
                "correct": "Well spotted — all three learn from patterns rather than following fixed rules.",
                "partial": "Some right. Remember: a calculator and a clock follow rules a programmer wrote.",
                "incorrect": "Look for tools that learn from examples rather than following a fixed rule."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "E",
                  "code": "AIF·CU·G6·E"
                }
              ],
              "tierProbed": "emerging",
              "evidenceType": "product"
            },
            {
              "id": "l01q4",
              "type": "matching",
              "marks": 4,
              "prompt": "Match each AI system to the kind of data it learns from.",
              "left": [
                {
                  "id": "l1",
                  "text": "Face recognition in a camera"
                },
                {
                  "id": "l2",
                  "text": "A translation app"
                },
                {
                  "id": "l3",
                  "text": "A spam filter"
                },
                {
                  "id": "l4",
                  "text": "A music recommendation system"
                }
              ],
              "right": [
                {
                  "id": "r1",
                  "text": "Thousands of labelled photographs"
                },
                {
                  "id": "r2",
                  "text": "Sentences already translated by people"
                },
                {
                  "id": "r3",
                  "text": "Emails marked as junk or not junk"
                },
                {
                  "id": "r4",
                  "text": "What millions of listeners played before"
                }
              ],
              "answer": {
                "l1": "r1",
                "l2": "r2",
                "l3": "r3",
                "l4": "r4"
              },
              "feedback": {
                "correct": "Every AI system learns from examples of the thing it needs to do.",
                "partial": "Some correct. Ask yourself what examples each system would need to see."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "E",
                  "code": "AIF·CU·G6·E"
                },
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "P",
                  "code": "AIF·CU·G6·P"
                }
              ],
              "tierProbed": "proficient",
              "evidenceType": "product"
            },
            {
              "id": "l01q5",
              "type": "fillBlank",
              "marks": 2,
              "prompt": "Complete the sentence: Machine learning systems find patterns in ______ instead of following ______ written by a programmer.",
              "blanks": [
                "first blank",
                "second blank"
              ],
              "answer": [
                [
                  "data",
                  "examples",
                  "training data"
                ],
                [
                  "rules",
                  "instructions",
                  "a rule"
                ]
              ],
              "feedback": {
                "correct": "That is the key difference in one sentence.",
                "partial": "One of the two is right — reread the section on machines that learn."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "P",
                  "code": "AIF·CU·G6·P"
                }
              ],
              "tierProbed": "proficient",
              "evidenceType": "product"
            },
            {
              "id": "l01q6",
              "type": "shortText",
              "marks": 3,
              "prompt": "Explain in your own words why it is easier to teach a computer to recognise a cat by showing it examples than by writing rules.",
              "placeholder": "Write two or three sentences…",
              "maxLength": 600,
              "keywordsAny": [
                "pattern",
                "example",
                "learn",
                "rule",
                "hard to describe",
                "too many",
                "different",
                "vary"
              ],
              "keywordsNeeded": 2,
              "modelAnswer": "Cats look different from each other and appear in different positions, colours and lighting, so it would take an enormous number of rules to describe every possible cat. Showing the system many labelled examples lets it find the patterns itself.",
              "hint": "Think about how many different ways a cat can appear in a photograph.",
              "feedback": {
                "correct": "Good explanation.",
                "partial": "You are on the right track — try to mention both the examples and why rules are hard.",
                "incorrect": "Reread 'Machines that follow rules'. Think about why a face or a cat is hard to describe in rules."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "E",
                  "code": "AIF·CU·G6·E"
                },
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "P",
                  "code": "AIF·CU·G6·P"
                }
              ],
              "tierProbed": "proficient",
              "evidenceType": "product"
            }
          ]
        },
        "strands": [
          "CU"
        ],
        "track": "main",
        "provisional": true
      },
      "g6-l02": {
        "id": "g6-l02",
        "number": 2,
        "type": "lab",
        "provisional": true,
        "title": "Lab: Train your own image classifier",
        "summary": "Build a working machine learning model in the browser, then find out what happens when the training data is poor.",
        "duration": "60 minutes",
        "objectives": [
          "Train a machine learning model using your own examples",
          "Describe the stages of a [[machine learning workflow]]",
          "Measure how accurate a model is",
          "Explain how **biased training data** produces unfair results"
        ],
        "sections": [
          {
            "type": "callout",
            "label": "Before you start",
            "body": [
              "You will need a device with a webcam and an internet connection. Nothing you make in this lab is uploaded or saved to anyone else's computer — the model trains inside your browser and disappears when you close the tab."
            ]
          },
          {
            "type": "text",
            "heading": "What you are building",
            "body": [
              "You are going to teach a computer to tell two things apart — for example, a pen and a rubber, or your hand showing a thumbs up and a thumbs down. You will not write a single rule. You will only show it examples.",
              "This is exactly how the image recognition in a phone camera is built, just much smaller."
            ]
          },
          {
            "type": "steps",
            "heading": "Part 1 — Train a model",
            "items": [
              "Open **Teachable Machine** in your browser and choose **Image Project**, then **Standard image model**.",
              "Rename **Class 1** to the name of your first object, for example *Pen*.",
              "Click **Webcam** and hold the object in front of the camera. Hold the record button for about ten seconds, moving the object around as you go. You should collect roughly 100 images.",
              "Rename **Class 2** to your second object, for example *Rubber*, and record about 100 images the same way.",
              "Click **Train Model**. Do not switch tabs while it trains.",
              "When training finishes, hold each object up to the webcam and watch the confidence bars move."
            ]
          },
          {
            "type": "activity",
            "label": "Record your results",
            "heading": "Part 2 — Test it properly",
            "body": [
              "Testing a model on the same images you trained it with tells you nothing. You have to test it on things it has never seen.",
              "Show each object to the camera **ten times**, in different positions and different lighting. Count how many times the model gets it right out of the twenty tests in total."
            ],
            "items": [
              "Test your first object ten times. Write down how many were correct.",
              "Test your second object ten times. Write down how many were correct.",
              "Add the two numbers together to get your score out of 20."
            ]
          },
          {
            "type": "steps",
            "heading": "Part 3 — Break it on purpose",
            "items": [
              "Start a **new** Image Project.",
              "Train it again with the same two objects — but this time record all of your examples in one position only, without moving the object at all.",
              "Use only about 20 images per class instead of 100.",
              "Train the model, then test it by holding the objects at completely different angles.",
              "Notice how much worse it performs. The model has not become less clever. It has simply never seen anything like what you are now showing it."
            ]
          },
          {
            "type": "callout",
            "label": "The big idea",
            "body": [
              "A machine learning model can only recognise what its **training data** taught it. If the examples are few, or all the same, or only show one kind of thing, the model will fail on everything else.",
              "This is where [[bias]] comes from. A face recognition system trained mostly on one group of people works badly for everyone else — not because anyone intended that, but because of what it was shown."
            ]
          }
        ],
        "worksheet": {
          "title": "Lab 2 worksheet",
          "questions": [
            {
              "id": "l02q1",
              "type": "ordering",
              "marks": 4,
              "prompt": "Put the stages of a machine learning project into the correct order.",
              "items": [
                {
                  "id": "s1",
                  "text": "Collect examples for each class"
                },
                {
                  "id": "s2",
                  "text": "Train the model on the examples"
                },
                {
                  "id": "s3",
                  "text": "Test the model on new things it has not seen"
                },
                {
                  "id": "s4",
                  "text": "Improve the training data and train again"
                }
              ],
              "answer": [
                "s1",
                "s2",
                "s3",
                "s4"
              ],
              "feedback": {
                "correct": "That is the loop every machine learning project goes round.",
                "partial": "Close. Remember you cannot test before you have trained."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "SD",
                  "grade": 6,
                  "tier": "P",
                  "code": "AIF·SD·G6·P"
                }
              ],
              "tierProbed": "proficient",
              "evidenceType": "product"
            },
            {
              "id": "l02q2",
              "type": "numeric",
              "marks": 2,
              "prompt": "A model was tested 20 times and got 17 correct. What is its accuracy as a percentage?",
              "answer": 85,
              "tolerance": 0.5,
              "placeholder": "Percentage",
              "hint": "Divide the number correct by the number of tests, then multiply by 100.",
              "feedback": {
                "correct": "17 out of 20 is 85%.",
                "incorrect": "17 ÷ 20 = 0.85, and 0.85 × 100 = 85%."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CE",
                  "grade": 6,
                  "tier": "P",
                  "code": "AIF·CE·G6·P"
                }
              ],
              "tierProbed": "proficient",
              "evidenceType": "product"
            },
            {
              "id": "l02q3",
              "type": "mcq",
              "marks": 2,
              "prompt": "Why must you test a model on images it has never seen before?",
              "options": [
                {
                  "id": "a",
                  "text": "Because testing on training images only shows it can remember, not that it can recognise"
                },
                {
                  "id": "b",
                  "text": "Because the training images get deleted after training"
                },
                {
                  "id": "c",
                  "text": "Because new images train the model further"
                },
                {
                  "id": "d",
                  "text": "Because it makes the model run faster"
                }
              ],
              "answer": "a",
              "feedback": {
                "correct": "Right — a model that only works on what it has already seen is useless.",
                "incorrect": "Think about the difference between remembering an answer and understanding it."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "A",
                  "code": "AIF·CU·G6·A"
                }
              ],
              "tierProbed": "advanced",
              "evidenceType": "product"
            },
            {
              "id": "l02q4",
              "type": "multi",
              "marks": 3,
              "prompt": "In Part 3 you trained a deliberately weak model. Select **all** the reasons it performed badly.",
              "options": [
                {
                  "id": "a",
                  "text": "There were far fewer training images"
                },
                {
                  "id": "b",
                  "text": "Every image was taken from the same position"
                },
                {
                  "id": "c",
                  "text": "The computer was running too slowly"
                },
                {
                  "id": "d",
                  "text": "The model had never seen the objects at other angles"
                },
                {
                  "id": "e",
                  "text": "The objects themselves had changed"
                }
              ],
              "answer": [
                "a",
                "b",
                "d"
              ],
              "feedback": {
                "correct": "All three are problems with the training data, not the model.",
                "partial": "Some right. The model and the computer were identical both times — only the data changed."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CU",
                  "grade": 6,
                  "tier": "A",
                  "code": "AIF·CU·G6·A"
                },
                {
                  "framework": "AIF",
                  "strand": "GE",
                  "grade": 6,
                  "tier": "A",
                  "code": "AIF·GE·G6·A"
                }
              ],
              "tierProbed": "advanced",
              "evidenceType": "product"
            },
            {
              "id": "l02q5",
              "type": "shortText",
              "marks": 4,
              "prompt": "A company builds a face recognition system and trains it almost entirely on photographs of adults. Explain what problem this is likely to cause, and how the company could fix it.",
              "placeholder": "Write three or four sentences…",
              "maxLength": 800,
              "keywordsAny": [
                "children",
                "child",
                "young",
                "bias",
                "biased",
                "unfair",
                "fail",
                "worse",
                "more data",
                "varied",
                "diverse",
                "range",
                "different people"
              ],
              "keywordsNeeded": 3,
              "modelAnswer": "The system would work poorly on children's faces, because it has never been shown examples of them. That is unfair to anyone the training data left out, and it could mean children are not recognised or are misidentified. The company should fix it by collecting a much more varied set of training photographs covering people of all ages, and then testing the system separately on each group to check it works for everyone.",
              "hint": "Who is missing from the training data, and what happens to them?",
              "feedback": {
                "correct": "Good — you identified who is affected and what would fix it.",
                "partial": "You have part of it. Make sure you say who is affected *and* what the company should do.",
                "incorrect": "Reread 'The big idea'. Think about who is missing from the training data."
              },
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "GE",
                  "grade": 6,
                  "tier": "A",
                  "code": "AIF·GE·G6·A"
                }
              ],
              "tierProbed": "advanced",
              "evidenceType": "product"
            },
            {
              "id": "l02q6",
              "type": "shortText",
              "autoMarked": false,
              "prompt": "Exit ticket: which single data flaw would you fix first to improve the output the most, and why?",
              "stem": "The flaw I would fix first is ___ because ___.",
              "lookFor": "Names one specific flaw from their own investigation log and links it to a change in the output, rather than giving a general statement about data quality.",
              "frameworkRefs": [
                {
                  "framework": "AIF",
                  "strand": "CE",
                  "grade": 6,
                  "tier": "E",
                  "code": "AIF·CE·G6·E"
                }
              ],
              "evidenceType": "product",
              "tierProbed": "emerging"
            }
          ]
        },
        "strands": [
          "CU",
          "SD",
          "GE",
          "CE"
        ],
        "track": "main"
      }
    }
  }
};

/** Official ADEK framework catalogue — strand descriptors per grade per tier. */
const FRAMEWORK = {
  "source": "ADEK AI Literacy Curriculum — Scope & Sequence, KG to Grade 12, Term 1",
  "framework": "ADEK K–12 AI Fluency Framework",
  "extractedFrom": "curriculum/source/ADEK_Scope_and_Sequence_Term1.html",
  "tiers": [
    {
      "key": "emerging",
      "label": "Emerging",
      "letter": "E",
      "ordinal": 1
    },
    {
      "key": "proficient",
      "label": "Proficient",
      "letter": "P",
      "ordinal": 2
    },
    {
      "key": "advanced",
      "label": "Advanced",
      "letter": "A",
      "ordinal": 3
    }
  ],
  "strandRows": [
    {
      "row": "Knowing how intelligent systems learn and operate",
      "theme": "How AI works"
    },
    {
      "row": "Working with data, and designing solutions",
      "theme": "Data & design"
    },
    {
      "row": "Exercising judgement in the use of AI systems",
      "theme": "Judgement"
    },
    {
      "row": "Assessing AI systems for ethical use",
      "theme": "Ethics & governance"
    }
  ],
  "grades": {
    "kg1": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·KG1·E",
            "descriptor": "Notices that machines or objects respond to human actions through unplugged observation."
          },
          "proficient": {
            "code": "AIF·CU·KG1·P",
            "descriptor": "Identifies simple sensors (e.g., cameras, microphones) and distinguishes them from human senses."
          },
          "advanced": {
            "code": "AIF·CU·KG1·A",
            "descriptor": "Describes simple cause-and-effect relationships independently during physical play."
          }
        }
      },
      "DA": {
        "code": "DA",
        "label": "Data Awareness",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·DA·KG1·E",
            "descriptor": "Recognises that information is needed to complete a task in guided physical examples."
          },
          "proficient": {
            "code": "AIF·DA·KG1·P",
            "descriptor": "Sorts physical objects and explains grouping by one attribute (e.g., colour, shape, size)."
          },
          "advanced": {
            "code": "AIF·DA·KG1·A",
            "descriptor": "Sorts using multiple attributes and explains how grouping supports decision-making."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·KG1·E",
            "descriptor": "Follows one-step instructions from a peer or teacher during role-play."
          },
          "proficient": {
            "code": "AIF·CE·KG1·P",
            "descriptor": "Follows and gives simple 1–2 step instructions clearly."
          },
          "advanced": {
            "code": "AIF·CE·KG1·A",
            "descriptor": "Identifies unclear instructions and suggests simple improvements independently."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Ethics & Privacy",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·KG1·E",
            "descriptor": "Recognises personal information (e.g., name, age) when prompted."
          },
          "proficient": {
            "code": "AIF·GE·KG1·P",
            "descriptor": "Explains that some information is private and seeks adult help when unsure."
          },
          "advanced": {
            "code": "AIF·GE·KG1·A",
            "descriptor": "Demonstrates safe behaviour in social play and explains why it is important."
          }
        }
      }
    },
    "kg2": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·KG2·E",
            "descriptor": "Recognises that some digital tools respond to inputs (e.g., voice, touch)."
          },
          "proficient": {
            "code": "AIF·CU·KG2·P",
            "descriptor": "Explains simple differences between human decisions and machine responses."
          },
          "advanced": {
            "code": "AIF·CU·KG2·A",
            "descriptor": "Explores how sensors and patterns influence responses through structured play."
          }
        }
      },
      "DA": {
        "code": "DA",
        "label": "Data Awareness",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·DA·KG2·E",
            "descriptor": "Understands that machines use information to respond."
          },
          "proficient": {
            "code": "AIF·DA·KG2·P",
            "descriptor": "Sorts and groups objects using more than one attribute and explains reasoning."
          },
          "advanced": {
            "code": "AIF·DA·KG2·A",
            "descriptor": "Demonstrates that incomplete or incorrect information leads to incorrect outcomes."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·KG2·E",
            "descriptor": "Recognises that clearer instructions lead to better responses."
          },
          "proficient": {
            "code": "AIF·CE·KG2·P",
            "descriptor": "Gives clear 2–3 step instructions and adjusts wording when needed."
          },
          "advanced": {
            "code": "AIF·CE·KG2·A",
            "descriptor": "Demonstrates persistence in refining instructions through iterative play."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Ethics & Privacy",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·KG2·E",
            "descriptor": "Understands basic ideas of privacy and fairness in simple contexts."
          },
          "proficient": {
            "code": "AIF·GE·KG2·P",
            "descriptor": "Identifies personal information and explains why it should be kept private."
          },
          "advanced": {
            "code": "AIF·GE·KG2·A",
            "descriptor": "Consistently demonstrates safe, fair, and respectful behaviour in interactions."
          }
        }
      }
    },
    "grade1": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G1·E",
            "descriptor": "Recognises that machines follow simple rules to respond."
          },
          "proficient": {
            "code": "AIF·CU·G1·P",
            "descriptor": "Describes inputs and outputs using everyday examples."
          },
          "advanced": {
            "code": "AIF·CU·G1·A",
            "descriptor": "Explains how changing an input changes the output."
          }
        }
      },
      "DA": {
        "code": "DA",
        "label": "Data Awareness",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·DA·G1·E",
            "descriptor": "Sorts information into simple groups with guidance."
          },
          "proficient": {
            "code": "AIF·DA·G1·P",
            "descriptor": "Sorts information independently using one attribute."
          },
          "advanced": {
            "code": "AIF·DA·G1·A",
            "descriptor": "Explains how different information leads to different results."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G1·E",
            "descriptor": "Follows simple step-by-step instructions with support."
          },
          "proficient": {
            "code": "AIF·CE·G1·P",
            "descriptor": "Creates simple step sequences to complete a task."
          },
          "advanced": {
            "code": "AIF·CE·G1·A",
            "descriptor": "Adjusts steps when outcomes are not correct."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Responsible AI Use",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G1·E",
            "descriptor": "Identifies personal information and safe sharing."
          },
          "proficient": {
            "code": "AIF·GE·G1·P",
            "descriptor": "Follows rules for safe and respectful use."
          },
          "advanced": {
            "code": "AIF·GE·G1·A",
            "descriptor": "Explains fairness in simple situations."
          }
        }
      }
    },
    "grade2": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G2·E",
            "descriptor": "Recognises that systems follow rules and make simple choices."
          },
          "proficient": {
            "code": "AIF·CU·G2·P",
            "descriptor": "Explains simple decision logic (if/then)."
          },
          "advanced": {
            "code": "AIF·CU·G2·A",
            "descriptor": "Explains how rules affect outcomes in different situations."
          }
        }
      },
      "DA": {
        "code": "DA",
        "label": "Data Awareness",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·DA·G2·E",
            "descriptor": "Sorts information using one attribute."
          },
          "proficient": {
            "code": "AIF·DA·G2·P",
            "descriptor": "Sorts using more than one attribute."
          },
          "advanced": {
            "code": "AIF·DA·G2·A",
            "descriptor": "Explains how incorrect or missing information affects outcomes."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G2·E",
            "descriptor": "Uses simple step-by-step instructions."
          },
          "proficient": {
            "code": "AIF·CE·G2·P",
            "descriptor": "Creates multi-step instructions to solve a task."
          },
          "advanced": {
            "code": "AIF·CE·G2·A",
            "descriptor": "Improves instructions to make outcomes more accurate."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Responsible AI Use",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G2·E",
            "descriptor": "Identifies safe vs unsafe sharing."
          },
          "proficient": {
            "code": "AIF·GE·G2·P",
            "descriptor": "Explains fairness in simple examples."
          },
          "advanced": {
            "code": "AIF·GE·G2·A",
            "descriptor": "Recognises when outcomes may be unfair."
          }
        }
      }
    },
    "grade3": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G3·E",
            "descriptor": "Recognises that multiple rules can be combined."
          },
          "proficient": {
            "code": "AIF·CU·G3·P",
            "descriptor": "Explains how combining rules affects outcomes."
          },
          "advanced": {
            "code": "AIF·CU·G3·A",
            "descriptor": "Predicts outcomes when rules are changed."
          }
        }
      },
      "DA": {
        "code": "DA",
        "label": "Data Awareness",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·DA·G3·E",
            "descriptor": "Recognises that different information affects decisions."
          },
          "proficient": {
            "code": "AIF·DA·G3·P",
            "descriptor": "Explains how missing or incorrect information changes outcomes."
          },
          "advanced": {
            "code": "AIF·DA·G3·A",
            "descriptor": "Identifies simple errors in information and suggests improvements."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G3·E",
            "descriptor": "Creates multi-step instructions with support."
          },
          "proficient": {
            "code": "AIF·CE·G3·P",
            "descriptor": "Creates structured instructions combining steps and conditions."
          },
          "advanced": {
            "code": "AIF·CE·G3·A",
            "descriptor": "Refines instructions independently to improve outcomes."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Responsible AI Use",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G3·E",
            "descriptor": "Recognises when results may not be fair."
          },
          "proficient": {
            "code": "AIF·GE·G3·P",
            "descriptor": "Explains how rules can create unfair outcomes."
          },
          "advanced": {
            "code": "AIF·GE·G3·A",
            "descriptor": "Suggests simple ways to make outcomes fairer."
          }
        }
      }
    },
    "grade4": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G4·E",
            "descriptor": "Recognises that systems use data to make decisions."
          },
          "proficient": {
            "code": "AIF·CU·G4·P",
            "descriptor": "Explains how data is represented and used."
          },
          "advanced": {
            "code": "AIF·CU·G4·A",
            "descriptor": "Explains how patterns in data influence outcomes."
          }
        }
      },
      "DA": {
        "code": "DA",
        "label": "Data Awareness",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·DA·G4·E",
            "descriptor": "Labels and organises simple data."
          },
          "proficient": {
            "code": "AIF·DA·G4·P",
            "descriptor": "Identifies errors or imbalance in data."
          },
          "advanced": {
            "code": "AIF·DA·G4·A",
            "descriptor": "Improves data to make it more accurate and balanced."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G4·E",
            "descriptor": "Uses block-based tools to simulate decisions."
          },
          "proficient": {
            "code": "AIF·CE·G4·P",
            "descriptor": "Creates simple solutions using data and logic."
          },
          "advanced": {
            "code": "AIF·CE·G4·A",
            "descriptor": "Explains how data influences the outcome of a solution."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Responsible AI Use",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G4·E",
            "descriptor": "Recognises that data can affect fairness."
          },
          "proficient": {
            "code": "AIF·GE·G4·P",
            "descriptor": "Explains how biased data leads to unfair outcomes."
          },
          "advanced": {
            "code": "AIF·GE·G4·A",
            "descriptor": "Evaluates fairness based on input data."
          }
        }
      }
    },
    "grade5": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G5·E",
            "descriptor": "Recognises that AI systems generate outputs using data."
          },
          "proficient": {
            "code": "AIF·CU·G5·P",
            "descriptor": "Explains how AI uses data to generate responses."
          },
          "advanced": {
            "code": "AIF·CU·G5·A",
            "descriptor": "Explains how data quality affects AI outputs."
          }
        }
      },
      "DA": {
        "code": "DA",
        "label": "Data Literacy",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·DA·G5·E",
            "descriptor": "Recognises that data affects outputs."
          },
          "proficient": {
            "code": "AIF·DA·G5·P",
            "descriptor": "Identifies when data is incomplete or biased."
          },
          "advanced": {
            "code": "AIF·DA·G5·A",
            "descriptor": "Suggests improvements to make data more reliable."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G5·E",
            "descriptor": "Uses AI tools to generate simple outputs with guidance."
          },
          "proficient": {
            "code": "AIF·SD·G5·P",
            "descriptor": "Uses structured prompts to generate useful outputs."
          },
          "advanced": {
            "code": "AIF·SD·G5·A",
            "descriptor": "Refines prompts to improve output quality and explains why."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Ethics & Responsible Use",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G5·E",
            "descriptor": "Recognises when outputs may be incorrect."
          },
          "proficient": {
            "code": "AIF·GE·G5·P",
            "descriptor": "Evaluates outputs for accuracy and fairness."
          },
          "advanced": {
            "code": "AIF·GE·G5·A",
            "descriptor": "Explains misinformation risks and proposes verification strategies."
          }
        }
      }
    },
    "grade6": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G6·E",
            "descriptor": "Recognises the difference between rule-based and learning systems."
          },
          "proficient": {
            "code": "AIF·CU·G6·P",
            "descriptor": "Explains how AI systems learn from data to generate outputs."
          },
          "advanced": {
            "code": "AIF·CU·G6·A",
            "descriptor": "Explains how training data affects output quality and performance."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G6·E",
            "descriptor": "Uses AI tools with structured prompts to complete tasks."
          },
          "proficient": {
            "code": "AIF·SD·G6·P",
            "descriptor": "Applies simple structured processes (input to output) to generate results."
          },
          "advanced": {
            "code": "AIF·SD·G6·A",
            "descriptor": "Builds structured AI-assisted solutions using guided inputs and data."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G6·E",
            "descriptor": "Identifies when outputs are incorrect or unclear."
          },
          "proficient": {
            "code": "AIF·CE·G6·P",
            "descriptor": "Evaluates outputs for accuracy and relevance."
          },
          "advanced": {
            "code": "AIF·CE·G6·A",
            "descriptor": "Explains how changes to inputs or data improve outputs."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Ethics & Governance",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G6·E",
            "descriptor": "Recognises basic risks (e.g. incorrect outputs, unsafe use)."
          },
          "proficient": {
            "code": "AIF·GE·G6·P",
            "descriptor": "Explains bias, privacy, and the need for responsible use."
          },
          "advanced": {
            "code": "AIF·GE·G6·A",
            "descriptor": "Identifies biased outputs and suggests simple ways to improve fairness and safety."
          }
        }
      }
    },
    "grade7": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G7·E",
            "descriptor": "Describes how AI systems follow a sequence of steps (input to process to output)."
          },
          "proficient": {
            "code": "AIF·CU·G7·P",
            "descriptor": "Explains how workflows structure AI systems."
          },
          "advanced": {
            "code": "AIF·CU·G7·A",
            "descriptor": "Explains how different workflow designs affect outcomes."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G7·E",
            "descriptor": "Builds simple AI solutions using guided steps."
          },
          "proficient": {
            "code": "AIF·SD·G7·P",
            "descriptor": "Designs multi-step AI workflows to complete tasks."
          },
          "advanced": {
            "code": "AIF·SD·G7·A",
            "descriptor": "Refines workflows by improving structure, sequencing, and tool selection."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G7·E",
            "descriptor": "Identifies issues in outputs or workflow steps."
          },
          "proficient": {
            "code": "AIF·CE·G7·P",
            "descriptor": "Evaluates outputs using criteria such as accuracy and usefulness."
          },
          "advanced": {
            "code": "AIF·CE·G7·A",
            "descriptor": "Improves workflows through iteration and explains the impact of changes."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Ethics & Governance",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G7·E",
            "descriptor": "Identifies risks in AI-generated outputs."
          },
          "proficient": {
            "code": "AIF·GE·G7·P",
            "descriptor": "Explains bias, misuse, and limitations in workflows."
          },
          "advanced": {
            "code": "AIF·GE·G7·A",
            "descriptor": "Proposes ways to reduce risks and improve responsible use of AI systems."
          }
        }
      }
    },
    "grade8": {
      "CU": {
        "code": "CU",
        "label": "AI Conceptual Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G8·E",
            "descriptor": "Describes how AI systems process inputs and generate outputs."
          },
          "proficient": {
            "code": "AIF·CU·G8·P",
            "descriptor": "Explains how different factors (data, inputs, design) affect performance."
          },
          "advanced": {
            "code": "AIF·CU·G8·A",
            "descriptor": "Compares approaches and explains why some solutions perform better."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G8·E",
            "descriptor": "Develops AI-powered solutions for specific tasks."
          },
          "proficient": {
            "code": "AIF·SD·G8·P",
            "descriptor": "Designs structured workflows combining multiple steps or tools."
          },
          "advanced": {
            "code": "AIF·SD·G8·A",
            "descriptor": "Designs and refines solutions considering how components interact."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G8·E",
            "descriptor": "Identifies limitations in outputs."
          },
          "proficient": {
            "code": "AIF·CE·G8·P",
            "descriptor": "Evaluates solutions using criteria such as accuracy, bias, and reliability."
          },
          "advanced": {
            "code": "AIF·CE·G8·A",
            "descriptor": "Refines solutions systematically and justifies improvements using evidence."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Ethics & Governance",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G8·E",
            "descriptor": "Identifies ethical concerns in AI use."
          },
          "proficient": {
            "code": "AIF·GE·G8·P",
            "descriptor": "Conducts structured evaluation of risks (bias, privacy, misuse)."
          },
          "advanced": {
            "code": "AIF·GE·G8·A",
            "descriptor": "Proposes mitigation strategies and explains their impact."
          }
        }
      }
    },
    "grade9": {
      "CU": {
        "code": "CU",
        "label": "AI Systems Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G9·E",
            "descriptor": "Describes how AI systems use inputs to generate outputs."
          },
          "proficient": {
            "code": "AIF·CU·G9·P",
            "descriptor": "Explains how data, tools, and prompts interact within a solution."
          },
          "advanced": {
            "code": "AIF·CU·G9·A",
            "descriptor": "Explains how design choices affect output quality and reliability."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G9·E",
            "descriptor": "Uses AI tools to complete structured tasks."
          },
          "proficient": {
            "code": "AIF·SD·G9·P",
            "descriptor": "Designs structured AI workflows to solve defined problems."
          },
          "advanced": {
            "code": "AIF·SD·G9·A",
            "descriptor": "Refines workflows to improve outputs and usability."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G9·E",
            "descriptor": "Identifies when outputs are incorrect or unclear."
          },
          "proficient": {
            "code": "AIF·CE·G9·P",
            "descriptor": "Evaluates outputs for accuracy, bias, and usefulness."
          },
          "advanced": {
            "code": "AIF·CE·G9·A",
            "descriptor": "Explains limitations and suggests targeted improvements."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Ethics & Responsible Use",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G9·E",
            "descriptor": "Identifies risks in AI-generated content."
          },
          "proficient": {
            "code": "AIF·GE·G9·P",
            "descriptor": "Explains bias, misinformation, and misuse."
          },
          "advanced": {
            "code": "AIF·GE·G9·A",
            "descriptor": "Proposes actions to ensure responsible and safe use."
          }
        }
      }
    },
    "grade10": {
      "CU": {
        "code": "CU",
        "label": "AI Systems Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G10·E",
            "descriptor": "Describes how different AI tools can be used together."
          },
          "proficient": {
            "code": "AIF·CU·G10·P",
            "descriptor": "Explains how components interact as a system."
          },
          "advanced": {
            "code": "AIF·CU·G10·A",
            "descriptor": "Evaluates how system design affects performance and reliability."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G10·E",
            "descriptor": "Designs simple AI workflows for specific tasks."
          },
          "proficient": {
            "code": "AIF·SD·G10·P",
            "descriptor": "Designs multi-step solutions combining tools and data."
          },
          "advanced": {
            "code": "AIF·SD·G10·A",
            "descriptor": "Selects and structures tools strategically to improve performance."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G10·E",
            "descriptor": "Identifies strengths and weaknesses of outputs."
          },
          "proficient": {
            "code": "AIF·CE·G10·P",
            "descriptor": "Evaluates solutions using criteria (accuracy, fairness, usefulness)."
          },
          "advanced": {
            "code": "AIF·CE·G10·A",
            "descriptor": "Refines solutions and explains the impact of improvements."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Governance & Ethics",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G10·E",
            "descriptor": "Identifies ethical concerns in AI use."
          },
          "proficient": {
            "code": "AIF·GE·G10·P",
            "descriptor": "Conducts structured evaluation of risks (bias, privacy, misuse)."
          },
          "advanced": {
            "code": "AIF·GE·G10·A",
            "descriptor": "Proposes mitigation strategies and explains their effectiveness."
          }
        }
      }
    },
    "grade11": {
      "CU": {
        "code": "CU",
        "label": "AI Systems Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G11·E",
            "descriptor": "Describes how AI solutions operate within broader systems."
          },
          "proficient": {
            "code": "AIF·CU·G11·P",
            "descriptor": "Explains interactions between data, tools, and users."
          },
          "advanced": {
            "code": "AIF·CU·G11·A",
            "descriptor": "Evaluates trade-offs (accuracy, efficiency, usability, reliability)."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G11·E",
            "descriptor": "Designs AI-powered solutions for real-world tasks."
          },
          "proficient": {
            "code": "AIF·SD·G11·P",
            "descriptor": "Designs structured multi-step solutions addressing user needs."
          },
          "advanced": {
            "code": "AIF·SD·G11·A",
            "descriptor": "Optimises solutions to improve efficiency, usability, and performance."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G11·E",
            "descriptor": "Identifies limitations in solutions."
          },
          "proficient": {
            "code": "AIF·CE·G11·P",
            "descriptor": "Evaluates solutions using multiple criteria and evidence."
          },
          "advanced": {
            "code": "AIF·CE·G11·A",
            "descriptor": "Justifies improvements using data and structured reasoning."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Governance & Impact",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G11·E",
            "descriptor": "Identifies potential impacts of AI solutions."
          },
          "proficient": {
            "code": "AIF·GE·G11·P",
            "descriptor": "Conducts structured analysis of ethical and societal implications."
          },
          "advanced": {
            "code": "AIF·GE·G11·A",
            "descriptor": "Proposes responsible-use approaches considering broader impact."
          }
        }
      }
    },
    "grade12": {
      "CU": {
        "code": "CU",
        "label": "AI Systems Understanding",
        "theme": "How AI works",
        "frameworkRow": "Knowing how intelligent systems learn and operate",
        "tiers": {
          "emerging": {
            "code": "AIF·CU·G12·E",
            "descriptor": "Explains how AI solutions function in real-world contexts."
          },
          "proficient": {
            "code": "AIF·CU·G12·P",
            "descriptor": "Analyses how system components interact and influence outcomes."
          },
          "advanced": {
            "code": "AIF·CU·G12·A",
            "descriptor": "Evaluates system effectiveness considering performance, risk, and scalability."
          }
        }
      },
      "SD": {
        "code": "SD",
        "label": "AI Solution Design & Development",
        "theme": "Data & design",
        "frameworkRow": "Working with data, and designing solutions",
        "tiers": {
          "emerging": {
            "code": "AIF·SD·G12·E",
            "descriptor": "Designs AI-powered solutions for defined problems."
          },
          "proficient": {
            "code": "AIF·SD·G12·P",
            "descriptor": "Designs and refines solutions addressing complex challenges."
          },
          "advanced": {
            "code": "AIF·SD·G12·A",
            "descriptor": "Designs integrated, multi-component solutions with strategic intent."
          }
        }
      },
      "CE": {
        "code": "CE",
        "label": "Critical Evaluation & Informed Interaction",
        "theme": "Judgement",
        "frameworkRow": "Exercising judgement in the use of AI systems",
        "tiers": {
          "emerging": {
            "code": "AIF·CE·G12·E",
            "descriptor": "Identifies areas for improvement."
          },
          "proficient": {
            "code": "AIF·CE·G12·P",
            "descriptor": "Evaluates solutions using evidence and defined criteria."
          },
          "advanced": {
            "code": "AIF·CE·G12·A",
            "descriptor": "Justifies refinements using data, evidence, and structured reasoning."
          }
        }
      },
      "GE": {
        "code": "GE",
        "label": "Governance, Ethics & Societal Impact",
        "theme": "Ethics & governance",
        "frameworkRow": "Assessing AI systems for ethical use",
        "tiers": {
          "emerging": {
            "code": "AIF·GE·G12·E",
            "descriptor": "Identifies ethical and societal risks."
          },
          "proficient": {
            "code": "AIF·GE·G12·P",
            "descriptor": "Conducts structured impact analysis (bias, privacy, societal implications)."
          },
          "advanced": {
            "code": "AIF·GE·G12·A",
            "descriptor": "Designs responsible-use approaches and defends decisions considering impact."
          }
        }
      }
    }
  }
};

/** Published week-by-week Main Course and Bridging sequences. */
const SEQUENCES = {
  "grade1": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Rules, Inputs & Outputs (Unit Launch)"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 1 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Machines Follow Rules"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Recognises that machines follow simple rules to respond.",
        "stretch": "Describes inputs and outputs using everyday examples."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Sort the Information"
          }
        ],
        "strand": "Data Awareness",
        "secures": "Sorts information into simple groups with guidance.",
        "stretch": "Sorts information independently using one attribute."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Follow the Steps"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Follows simple step-by-step instructions with support.",
        "stretch": "Creates simple step sequences to complete a task."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Safe & Private"
          }
        ],
        "strand": "Responsible AI Use",
        "secures": "Identifies personal information and safe sharing.",
        "stretch": "Follows rules for safe and respectful use."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Rules, Information & Steps Together"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 1 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Plan Our Rule Machine (Signature Project – Planning)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 1 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Build Our Rule Machine (Signature Project – Building)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Test & Improve Our Rule Machine (Signature Project – Refining)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Show What We Know (Showcase & Assessment)"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ]
  },
  "grade2": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Rules & Choices (Unit Launch)"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 2 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "IF → THEN: Rules Make Choices"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Recognises that systems follow rules and make simple choices.",
        "stretch": "Explains simple decision logic (if/then)."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Sort by One Thing"
          }
        ],
        "strand": "Data Awareness",
        "secures": "Sorts information using one attribute.",
        "stretch": "Sorts using more than one attribute."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Step by Step"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Uses simple step-by-step instructions.",
        "stretch": "Creates multi-step instructions to solve a task."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Safe or Unsafe? Fair or Unfair?"
          }
        ],
        "strand": "Responsible AI Use",
        "secures": "Identifies safe vs unsafe sharing.",
        "stretch": "Explains fairness in simple examples."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Rules, Choices & Steps Together"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 2 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Plan Our Rule Robot (Signature Project – Planning)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 2 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Build & Test Our Rule Robot (Signature Project – Building)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Test & Fix Our Rule Robot (Signature Project – Refining)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Show What We Know (Showcase & Assessment)"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ]
  },
  "grade3": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Combining Rules (Unit Launch)"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 3 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Two Rules at Once (IF this AND that)"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Recognises that multiple rules can be combined.",
        "stretch": "Explains how combining rules affects outcomes."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Different Information, Different Decision"
          }
        ],
        "strand": "Data Awareness",
        "secures": "Recognises that different information affects decisions.",
        "stretch": "Explains how missing or incorrect information changes outcomes."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Clear Multi-Step Instructions"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Creates multi-step instructions with support.",
        "stretch": "Creates structured instructions combining steps and conditions."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Is the Rule Fair for Everyone?"
          }
        ],
        "strand": "Responsible AI Use",
        "secures": "Recognises when results may not be fair.",
        "stretch": "Explains how rules can create unfair outcomes."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Rules, Information & Steps Together"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 3 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Plan Our Rule Robot (Signature Project – Planning)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 3 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Build Our Rule Robot (Signature Project – Building)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Test & Fix Our Rule Robot (Signature Project – Refining)"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Show What We Know (Showcase & Assessment)"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ]
  },
  "grade4": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Data All Around Us"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 4 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Concepts: Input and Decision"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Recognises that systems use data to make decisions.",
        "stretch": "Explains how data is represented and used."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Working with Information"
          }
        ],
        "strand": "Data Awareness",
        "secures": "Labels and organises simple data.",
        "stretch": "Identifies errors or imbalance in data."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Simulating Decisions"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Uses block-based tools to simulate decisions.",
        "stretch": "Creates simple solutions using data and logic."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Data and Fairness"
          }
        ],
        "strand": "Responsible AI Use",
        "secures": "Recognises that data can affect fairness.",
        "stretch": "Explains how biased data leads to unfair outcomes."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Bringing the Strands Together"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 4 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Signature Activity: Planning"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 4 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Signature Activity: Building"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Signature Activity: Refining & Finishing"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Showcase, Assessment & Reflection"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Rules and What Happens Next: Predicting Outcomes"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "rebuildsTo": "Predicts outcomes when rules are changed.",
        "frameworkRefs": [
          "AIF·CU·G3·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Spot the Mistake: Checking Information"
          }
        ],
        "strand": "Data Awareness",
        "rebuildsTo": "Identifies simple errors in information and suggests improvements.",
        "frameworkRefs": [
          "AIF·CU·G3·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Make It Better: Improving Instructions"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Refines instructions independently to improve outcomes.",
        "frameworkRefs": [
          "AIF·CE·G3·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Fair for Everyone: Making Outcomes Fairer"
          }
        ],
        "strand": "Responsible AI Use",
        "rebuildsTo": "Suggests simple ways to make outcomes fairer.",
        "frameworkRefs": [
          "AIF·GE·G3·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "The Fair Decision Machine: Design & Build (Part 1)"
          }
        ],
        "strand": "Integration – three strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies three rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G3·A",
          "AIF·CE·G3·A",
          "AIF·GE·G3·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "The Fair Decision Machine: Refine, Present & Reflect (Part 2)"
          }
        ],
        "strand": "Integration – three strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G3·A",
          "AIF·CE·G3·A",
          "AIF·GE·G3·A"
        ]
      }
    ]
  },
  "grade5": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Working with AI: Data, Prompts & Outputs"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 5 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "How AI Makes Outputs"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Recognises that AI systems generate outputs using data.",
        "stretch": "Explains how AI uses data to generate responses."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Does the Data Affect the Output?"
          }
        ],
        "strand": "Data Literacy",
        "secures": "Recognises that data affects outputs.",
        "stretch": "Identifies when data is incomplete or biased."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Prompting for an Output"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Uses AI tools to generate simple outputs with guidance.",
        "stretch": "Uses structured prompts to generate useful outputs."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "When Outputs May Be Wrong"
          }
        ],
        "strand": "Ethics & Responsible Use",
        "secures": "Recognises when outputs may be incorrect.",
        "stretch": "Evaluates outputs for accuracy and fairness."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Bringing the Strands Together"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 5 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Signature Activity: Planning"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 5 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Signature Activity: Building a First Draft with AI"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Signature Activity: Refining & Finishing Your Piece"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Showcase, Assessment & Reflection"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Patterns in Data: Reading What the Data Says"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "rebuildsTo": "Explains how patterns in data influence outcomes.",
        "frameworkRefs": [
          "AIF·CU·G4·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Improving Data: Making Information Accurate and Balanced"
          }
        ],
        "strand": "Data Literacy",
        "rebuildsTo": "Improves data to make it more accurate and balanced.",
        "frameworkRefs": [
          "AIF·CU·G4·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Meet the AI: Giving an Instruction, Reading an Output"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Foundations of AI Solution Design & Development: using an AI tool, with guidance, to generate a simple output. (New strand this grade – no prior grade; delivered fresh.)",
        "frameworkRefs": [
          "AIF·SD·G4·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "lesson",
            "title": "Is It Fair? Judging Outcomes from the Data"
          }
        ],
        "strand": "Ethics & Responsible Use",
        "rebuildsTo": "Evaluates fairness based on input data.",
        "frameworkRefs": [
          "AIF·GE·G4·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Reliable Recommendation: Read, Improve & Design (Part 1)"
          }
        ],
        "strand": "Integration – three strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies three rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G4·A",
          "AIF·SD·G4·A",
          "AIF·GE·G4·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Reliable Recommendation: Generate, Judge & Reflect (Part 2)"
          }
        ],
        "strand": "Integration – three strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G4·A",
          "AIF·SD·G4·A",
          "AIF·GE·G4·A"
        ]
      }
    ]
  },
  "grade6": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "core",
            "title": "Rule-Based vs Learning Systems"
          },
          {
            "kind": "lab",
            "title": "Rule vs Learning: Hands-On Exploration"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 6 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Rules vs Learning: How Each System Works"
          },
          {
            "kind": "lab",
            "title": "Train a Simple Model"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Recognises the difference between rule-based and learning systems.",
        "stretch": "Explains how AI systems learn from data to generate outputs."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Structured Prompts to Complete a Task"
          },
          {
            "kind": "lab",
            "title": "Prompt-to-Task Workshop"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Uses AI tools with structured prompts to complete tasks.",
        "stretch": "Applies simple structured processes (input to output) to generate results."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Judging Outputs: Correct, Incorrect, Unclear"
          },
          {
            "kind": "lab",
            "title": "Output Triage Clinic"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Identifies when outputs are incorrect or unclear.",
        "stretch": "Evaluates outputs for accuracy and relevance."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Risks and Responsible Use"
          },
          {
            "kind": "lab",
            "title": "Class AI Risk Audit"
          }
        ],
        "strand": "Ethics & Governance",
        "secures": "Recognises basic risks (e.g. incorrect outputs, unsafe use).",
        "stretch": "Explains bias, privacy, and the need for responsible use."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "core",
            "title": "Bringing the Strands Together"
          },
          {
            "kind": "lab",
            "title": "Integrated Build-and-Check"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 6 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "core",
            "title": "Signature Solution: Planning"
          },
          {
            "kind": "lab",
            "title": "Prototype and Pressure-Test the Plan"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 6 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "core",
            "title": "Signature Solution: Building"
          },
          {
            "kind": "lab",
            "title": "Extended Build and Evaluation"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "core",
            "title": "Signature Solution: Refining & Finishing"
          },
          {
            "kind": "lab",
            "title": "Final Iteration and Risk Review"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "core",
            "title": "Showcase, Assessment & Reflection"
          },
          {
            "kind": "lab",
            "title": "Showcase Carousel and Reflection"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Data Quality and AI Outputs"
          },
          {
            "kind": "lab",
            "title": "Data Quality Investigation"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "rebuildsTo": "Explains how data quality affects AI outputs.",
        "frameworkRefs": [
          "AIF·CU·G5·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Refining Prompts for Better Outputs"
          },
          {
            "kind": "lab",
            "title": "Prompt Refinement Workshop"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Refines prompts to improve output quality and explains why.",
        "frameworkRefs": [
          "AIF·SD·G5·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "How Data Shapes a Solution’s Outcome"
          },
          {
            "kind": "lab",
            "title": "Trace-the-Data Investigation"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Explains how data influences the outcome of a solution.",
        "frameworkRefs": [
          "AIF·CE·G4·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Misinformation Risks and Verification"
          },
          {
            "kind": "lab",
            "title": "Verify and De-risk Workshop"
          }
        ],
        "strand": "Ethics & Governance",
        "rebuildsTo": "Explains misinformation risks and proposes verification strategies.",
        "frameworkRefs": [
          "AIF·GE·G5·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "core",
            "title": "Trustworthy AI Helper: Design & Test the Data (Part 1)"
          },
          {
            "kind": "lab",
            "title": "Trustworthy AI Helper: Build & Refine the Prompt (Part 1)"
          }
        ],
        "strand": "Integration – all four strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G5·A",
          "AIF·SD·G5·A",
          "AIF·CE·G4·A",
          "AIF·GE·G5·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "core",
            "title": "Trustworthy AI Helper: Trace the Data & Plan Checks (Part 2)"
          },
          {
            "kind": "lab",
            "title": "Trustworthy AI Helper: Verify, De-risk & Showcase (Part 2)"
          }
        ],
        "strand": "Integration – all four strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G5·A",
          "AIF·SD·G5·A",
          "AIF·CE·G4·A",
          "AIF·GE·G5·A"
        ]
      }
    ]
  },
  "grade7": {
    "main": [
      {
        "week": "Pre-1 Foundation",
        "weekNumber": null,
        "phase": "Pre-1 Foundation",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Foundation How Models Learn"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Describes how AI systems follow a sequence of steps (input to process to output).",
        "stretch": "Explains how workflows structure AI systems."
      },
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "core",
            "title": "AI as a Workflow"
          },
          {
            "kind": "lab",
            "title": "Compare and Log the Difference"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 7 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "The Three-Stage Shape"
          },
          {
            "kind": "lab",
            "title": "Build, Trace and Test a Workflow"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Describes how AI systems follow a sequence of steps (input to process to output).",
        "stretch": "Explains how workflows structure AI systems."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Building a Workflow"
          },
          {
            "kind": "lab",
            "title": "Test, Fix and Chain"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Builds simple AI solutions using guided steps.",
        "stretch": "Designs multi-step AI workflows to complete tasks."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Judging Outputs"
          },
          {
            "kind": "lab",
            "title": "The Evaluation Clinic"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Identifies issues in outputs or workflow steps.",
        "stretch": "Evaluates outputs using criteria such as accuracy and usefulness."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Spotting the Risks"
          },
          {
            "kind": "lab",
            "title": "The Risk Audit"
          }
        ],
        "strand": "Ethics & Governance",
        "secures": "Identifies risks in AI-generated outputs.",
        "stretch": "Explains bias, misuse, and limitations in workflows."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "core",
            "title": "Four Strands, One Task"
          },
          {
            "kind": "lab",
            "title": "The Full Run"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 7 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "core",
            "title": "Architect First, Build Second"
          },
          {
            "kind": "lab",
            "title": "Run It, Break It, Make It Safer"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 7 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "core",
            "title": "Build, Evaluate, Improve"
          },
          {
            "kind": "lab",
            "title": "Finish It, Then Prove It"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "core",
            "title": "Refining & Finishing"
          },
          {
            "kind": "lab",
            "title": "Lock It & Rehearse"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "core",
            "title": "Showcase & Reflection"
          },
          {
            "kind": "lab",
            "title": "Peer Review & Stress-Test"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "The Data Behind the Answer"
          },
          {
            "kind": "lab",
            "title": "Run the Fair Test"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "rebuildsTo": "Explains how training data affects output quality and performance.",
        "frameworkRefs": [
          "AIF·CU·G6·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Build a Structured Solution"
          },
          {
            "kind": "lab",
            "title": "Test, Find, Refine"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Builds structured AI-assisted solutions using guided inputs and data.",
        "frameworkRefs": [
          "AIF·SD·G6·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "A Better Input, A Better Output"
          },
          {
            "kind": "lab",
            "title": "Rank, Then Iterate"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Explains how changes to inputs or data improve outputs.",
        "frameworkRefs": [
          "AIF·CE·G6·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "The Fairness Checker"
          },
          {
            "kind": "lab",
            "title": "One Workflow, Several Concerns"
          }
        ],
        "strand": "Ethics & Governance",
        "rebuildsTo": "Identifies biased outputs and suggests simple ways to improve fairness and safety.",
        "frameworkRefs": [
          "AIF·GE·G6·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Build a Sorting Helper"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G6·A",
          "AIF·SD·G6·A",
          "AIF·CE·G6·A",
          "AIF·GE·G6·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Prove It and Guard It"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G6·A",
          "AIF·SD·G6·A",
          "AIF·CE·G6·A",
          "AIF·GE·G6·A"
        ]
      }
    ]
  },
  "grade8": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "core",
            "title": "From ‘It Works’ to ‘How Well’"
          },
          {
            "kind": "lab",
            "title": "Two Outputs, One Verdict"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 8 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Inside the Pipeline"
          },
          {
            "kind": "lab",
            "title": "Change One Factor"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "secures": "Describes how AI systems process inputs and generate outputs.",
        "stretch": "Explains how different factors (data, inputs, design) affect performance."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Design the Workflow"
          },
          {
            "kind": "lab",
            "title": "Build, Test, Improve"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Develops AI-powered solutions for specific tasks.",
        "stretch": "Designs structured workflows combining multiple steps or tools."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Judge with Criteria"
          },
          {
            "kind": "lab",
            "title": "The Evaluation Clinic"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Identifies limitations in outputs.",
        "stretch": "Evaluates solutions using criteria such as accuracy, bias, and reliability."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Accurate Is Not Ethical"
          },
          {
            "kind": "lab",
            "title": "The Ethics Audit"
          }
        ],
        "strand": "Ethics & Governance",
        "secures": "Identifies ethical concerns in AI use.",
        "stretch": "Conducts structured evaluation of risks (bias, privacy, misuse)."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "core",
            "title": "One Model, Four Strands"
          },
          {
            "kind": "lab",
            "title": "Run It End to End"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 8 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "core",
            "title": "Architect the Plan"
          },
          {
            "kind": "lab",
            "title": "Prototype and Pressure-Test"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 8 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "core",
            "title": "The Build Loop"
          },
          {
            "kind": "lab",
            "title": "The Evaluation Log"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "core",
            "title": "Refining and Finishing"
          },
          {
            "kind": "lab",
            "title": "Lock It and Show It"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "core",
            "title": "Showcase and Reflect"
          },
          {
            "kind": "lab",
            "title": "Review, Measure, Aim"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "The Design Behind the Outcome"
          },
          {
            "kind": "lab",
            "title": "Run the Fair Test"
          }
        ],
        "strand": "AI Conceptual Understanding",
        "rebuildsTo": "Explains how different workflow designs affect outcomes.",
        "frameworkRefs": [
          "AIF·CU·G7·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Three Levers to Refine a Workflow"
          },
          {
            "kind": "lab",
            "title": "One Alert, Two Audiences"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Refines workflows by improving structure, sequencing, and tool selection.",
        "frameworkRefs": [
          "AIF·SD·G7·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Change, Judge, Improve"
          },
          {
            "kind": "lab",
            "title": "Score, Iterate, Justify"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Improves workflows through iteration and explains the impact of changes.",
        "frameworkRefs": [
          "AIF·CE·G7·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Spot the Risk, Fix It"
          },
          {
            "kind": "lab",
            "title": "Rank Risks, Build a Plan"
          }
        ],
        "strand": "Ethics & Governance",
        "rebuildsTo": "Proposes ways to reduce risks and improve responsible use of AI systems.",
        "frameworkRefs": [
          "AIF·GE·G7·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Design, Build, Test"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G7·A",
          "AIF·SD·G7·A",
          "AIF·CE·G7·A",
          "AIF·GE·G7·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Evaluate and Prove It"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G7·A",
          "AIF·SD·G7·A",
          "AIF·CE·G7·A",
          "AIF·GE·G7·A"
        ]
      }
    ]
  },
  "grade9": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "core",
            "title": "Open the Black Box"
          },
          {
            "kind": "lab",
            "title": "Change One Thing"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 9 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Understanding the System Extra How AI Learns"
          },
          {
            "kind": "lab",
            "title": "Test the System"
          }
        ],
        "strand": "AI Systems Understanding",
        "secures": "Describes how AI systems use inputs to generate outputs.",
        "stretch": "Explains how data, tools, and prompts interact within a solution."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Designing a Solution"
          },
          {
            "kind": "lab",
            "title": "Build, Test, Chain"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Uses AI tools to complete structured tasks.",
        "stretch": "Designs structured AI workflows to solve defined problems."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Judging Outputs"
          },
          {
            "kind": "lab",
            "title": "The Evaluation Clinic"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Identifies when outputs are incorrect or unclear.",
        "stretch": "Evaluates outputs for accuracy, bias, and usefulness."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Risk Is a System Property"
          },
          {
            "kind": "lab",
            "title": "Auditing the Risks"
          }
        ],
        "strand": "Ethics & Responsible Use",
        "secures": "Identifies risks in AI-generated content.",
        "stretch": "Explains bias, misinformation, and misuse."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "core",
            "title": "Four Strands, One Workflow"
          },
          {
            "kind": "lab",
            "title": "Running It End-to-End"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 9 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "core",
            "title": "Designing the System"
          },
          {
            "kind": "lab",
            "title": "Prototype and Pressure-Test"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 9 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "core",
            "title": "Assemble, Evaluate, Refine"
          },
          {
            "kind": "lab",
            "title": "Test, Log, Iterate"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "core",
            "title": "Refining & Finishing the System"
          },
          {
            "kind": "lab",
            "title": "Lock It & Rehearse the Demo"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "core",
            "title": "Showcase, Assess & Reflect"
          },
          {
            "kind": "lab",
            "title": "Peer Review & Aim Higher"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Comparing Approaches"
          },
          {
            "kind": "lab",
            "title": "The Fair Test"
          }
        ],
        "strand": "AI Systems Understanding",
        "rebuildsTo": "Compares approaches and explains why some solutions perform better.",
        "frameworkRefs": [
          "AIF·CU·G8·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Parts That Work Together"
          },
          {
            "kind": "lab",
            "title": "Growing the Workflow"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Designs and refines solutions considering how components interact.",
        "frameworkRefs": [
          "AIF·SD·G8·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Refine Like an Engineer"
          },
          {
            "kind": "lab",
            "title": "Run the Whole Cycle"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Refines solutions systematically and justifies improvements using evidence.",
        "frameworkRefs": [
          "AIF·CE·G8·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Risk Lives Between the Parts"
          },
          {
            "kind": "lab",
            "title": "Break the Risk Chain"
          }
        ],
        "strand": "Ethics & Responsible Use",
        "rebuildsTo": "Proposes mitigation strategies and explains their impact.",
        "frameworkRefs": [
          "AIF·GE·G8·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Build the Assistant"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G8·A",
          "AIF·SD·G8·A",
          "AIF·CE·G8·A",
          "AIF·GE·G8·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Prove It Works"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G8·A",
          "AIF·SD·G8·A",
          "AIF·CE·G8·A",
          "AIF·GE·G8·A"
        ]
      }
    ]
  },
  "grade10": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "core",
            "title": "See the Whole System"
          },
          {
            "kind": "lab",
            "title": "Compare, Map, and Stress-Test"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 10 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Understanding the System"
          },
          {
            "kind": "lab",
            "title": "Trace, Change, Compare"
          }
        ],
        "strand": "AI Systems Understanding",
        "secures": "Describes how different AI tools can be used together.",
        "stretch": "Explains how components interact as a system."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Designing a Solution"
          },
          {
            "kind": "lab",
            "title": "Build, Test, Improve"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Designs simple AI workflows for specific tasks.",
        "stretch": "Designs multi-step solutions combining tools and data."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Judging & Improving Outputs"
          },
          {
            "kind": "lab",
            "title": "The Evaluation Clinic"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Identifies strengths and weaknesses of outputs.",
        "stretch": "Evaluates solutions using criteria (accuracy, fairness, usefulness)."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Locate the Risk in the System"
          },
          {
            "kind": "lab",
            "title": "Measure the Risk and Govern It"
          }
        ],
        "strand": "Governance & Ethics",
        "secures": "Identifies ethical concerns in AI use.",
        "stretch": "Conducts structured evaluation of risks (bias, privacy, misuse)."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "core",
            "title": "Bringing the Strands Together"
          },
          {
            "kind": "lab",
            "title": "Run It End-to-End"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 10 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "core",
            "title": "Architect Your Signature Solution"
          },
          {
            "kind": "lab",
            "title": "Prototype and Pressure-Test"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 10 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "core",
            "title": "Build, Evaluate, Improve"
          },
          {
            "kind": "lab",
            "title": "Finish It, Then Prove It"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "core",
            "title": "Refining & Finishing the System"
          },
          {
            "kind": "lab",
            "title": "Lock It and Rehearse the Demo"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "core",
            "title": "Showcase & Reflection"
          },
          {
            "kind": "lab",
            "title": "Peer Review & Aim Higher"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Design Choices Shape the Output"
          },
          {
            "kind": "lab",
            "title": "Run the Fair Test"
          }
        ],
        "strand": "AI Systems Understanding",
        "rebuildsTo": "Explains how design choices affect output quality and reliability.",
        "frameworkRefs": [
          "AIF·CU·G9·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Refine the Weakest Stage"
          },
          {
            "kind": "lab",
            "title": "Measure, Don’t Guess"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Refines workflows to improve outputs and usability.",
        "frameworkRefs": [
          "AIF·SD·G9·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Explain Limitations, Target the Fix"
          },
          {
            "kind": "lab",
            "title": "Trace, Prioritise, Justify"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Explains limitations and suggests targeted improvements.",
        "frameworkRefs": [
          "AIF·CE·G9·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Propose Responsible-Use Actions"
          },
          {
            "kind": "lab",
            "title": "Build a Responsible-Use Plan"
          }
        ],
        "strand": "Governance & Ethics",
        "rebuildsTo": "Proposes actions to ensure responsible and safe use.",
        "frameworkRefs": [
          "AIF·GE·G9·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Design & Build an AI Solution"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G9·A",
          "AIF·SD·G9·A",
          "AIF·CE·G9·A",
          "AIF·GE·G9·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Evaluate, Justify & Showcase"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G9·A",
          "AIF·SD·G9·A",
          "AIF·CE·G9·A",
          "AIF·GE·G9·A"
        ]
      }
    ]
  },
  "grade11": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "core",
            "title": "See the System"
          },
          {
            "kind": "lab",
            "title": "Compare and Read the Trade-off"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 11 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Understanding the System"
          },
          {
            "kind": "lab",
            "title": "Trace, Change, Compare"
          }
        ],
        "strand": "AI Systems Understanding",
        "secures": "Describes how AI solutions operate within broader systems.",
        "stretch": "Explains interactions between data, tools, and users."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Designing a Solution"
          },
          {
            "kind": "lab",
            "title": "Build, Test, Improve"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Designs AI-powered solutions for real-world tasks.",
        "stretch": "Designs structured multi-step solutions addressing user needs."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Judging Outputs"
          },
          {
            "kind": "lab",
            "title": "Rank and Defend"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Identifies limitations in solutions.",
        "stretch": "Evaluates solutions using multiple criteria and evidence."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Risks, Ethics & Responsible Use"
          },
          {
            "kind": "lab",
            "title": "Audit, Rate, Mitigate"
          }
        ],
        "strand": "Governance & Impact",
        "secures": "Identifies potential impacts of AI solutions.",
        "stretch": "Conducts structured analysis of ethical and societal implications."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "core",
            "title": "Bringing the Strands Together"
          },
          {
            "kind": "lab",
            "title": "Run It End-to-End"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 11 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "core",
            "title": "Architect Your Signature Solution"
          },
          {
            "kind": "lab",
            "title": "Prototype and Pressure-Test"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 11 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "core",
            "title": "Build, Evaluate, Improve"
          },
          {
            "kind": "lab",
            "title": "Finish It, Then Prove It"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "core",
            "title": "Refining and Finishing"
          },
          {
            "kind": "lab",
            "title": "Lock It and Rehearse"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "core",
            "title": "Showcase and Reflection"
          },
          {
            "kind": "lab",
            "title": "Peer Review and Aim Higher"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Design Shapes Performance"
          },
          {
            "kind": "lab",
            "title": "Investigating Trade-offs"
          }
        ],
        "strand": "AI Systems Understanding",
        "rebuildsTo": "Evaluates how system design affects performance and reliability.",
        "frameworkRefs": [
          "AIF·CU·G10·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Right Tool, Right Stage"
          },
          {
            "kind": "lab",
            "title": "Optimising a Multi-Tool Workflow"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Selects and structures tools strategically to improve performance.",
        "frameworkRefs": [
          "AIF·SD·G10·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Refine and Explain the Impact"
          },
          {
            "kind": "lab",
            "title": "Run the Optimisation Cycle"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Refines solutions and explains the impact of improvements.",
        "frameworkRefs": [
          "AIF·CE·G10·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Propose Mitigations"
          },
          {
            "kind": "lab",
            "title": "Design a Mitigation Plan"
          }
        ],
        "strand": "Governance & Impact",
        "rebuildsTo": "Proposes mitigation strategies and explains their effectiveness.",
        "frameworkRefs": [
          "AIF·GE·G10·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Design and Build"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G10·A",
          "AIF·SD·G10·A",
          "AIF·CE·G10·A",
          "AIF·GE·G10·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Evaluate and Showcase"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G10·A",
          "AIF·SD·G10·A",
          "AIF·CE·G10·A",
          "AIF·GE·G10·A"
        ]
      }
    ]
  },
  "grade12": {
    "main": [
      {
        "week": "1 Launch",
        "weekNumber": 1,
        "phase": "Launch",
        "lessons": [
          {
            "kind": "core",
            "title": "See the Whole System"
          },
          {
            "kind": "lab",
            "title": "Compare and Map the System"
          }
        ],
        "strand": "All four strands",
        "secures": "Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 12 strands in a first guided task.",
        "stretch": "Students state the big idea in their own words and predict which strand each part of the task will need."
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Understanding the System"
          },
          {
            "kind": "lab",
            "title": "Trace the Divergence"
          }
        ],
        "strand": "AI Systems Understanding",
        "secures": "Explains how AI solutions function in real-world contexts.",
        "stretch": "Analyses how system components interact and influence outcomes."
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Designing a Solution"
          },
          {
            "kind": "lab",
            "title": "Refine Toward Complexity"
          }
        ],
        "strand": "AI Solution Design & Development",
        "secures": "Designs AI-powered solutions for defined problems.",
        "stretch": "Designs and refines solutions addressing complex challenges."
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Judging Outputs"
          },
          {
            "kind": "lab",
            "title": "Rank and Defend"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "secures": "Identifies areas for improvement.",
        "stretch": "Evaluates solutions using evidence and defined criteria."
      },
      {
        "week": "5",
        "weekNumber": 5,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Risks, Ethics & Societal Impact"
          },
          {
            "kind": "lab",
            "title": "Measure Fairness and Govern"
          }
        ],
        "strand": "Governance, Ethics & Societal Impact",
        "secures": "Identifies ethical and societal risks.",
        "stretch": "Conducts structured impact analysis (bias, privacy, societal implications)."
      },
      {
        "week": "6 Integrate",
        "weekNumber": 6,
        "phase": "Integrate",
        "lessons": [
          {
            "kind": "core",
            "title": "Bringing the Strands Together"
          },
          {
            "kind": "lab",
            "title": "Run End-to-End and Measure"
          }
        ],
        "strand": "All four strands",
        "secures": "Applies all four Grade 12 strands to one task, so the strands become a single practice rather than four separate lessons.",
        "stretch": "Students sequence the four strands independently and justify why each step is needed."
      },
      {
        "week": "7 Plan",
        "weekNumber": 7,
        "phase": "Plan",
        "lessons": [
          {
            "kind": "core",
            "title": "Architect Your Signature System"
          },
          {
            "kind": "lab",
            "title": "Prototype and Pressure-Test"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – planning. Students design a solution of their own that will require all four Grade 12 strands, and set the criteria it must meet.",
        "stretch": "Students justify design choices against their criteria before any building begins."
      },
      {
        "week": "8 Build",
        "weekNumber": 8,
        "phase": "Build",
        "lessons": [
          {
            "kind": "core",
            "title": "Build to Your Plan"
          },
          {
            "kind": "lab",
            "title": "Finish It and Handle Edge Cases"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.",
        "stretch": "Students diagnose what is not working from evidence rather than by trial and error."
      },
      {
        "week": "9 Refine",
        "weekNumber": 9,
        "phase": "Refine",
        "lessons": [
          {
            "kind": "core",
            "title": "Refining and Explainability"
          },
          {
            "kind": "lab",
            "title": "Lock the Architecture and Rehearse"
          }
        ],
        "strand": "All four strands",
        "secures": "Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.",
        "stretch": "Students explain the impact of each refinement using the evidence they gathered."
      },
      {
        "week": "10 Showcase",
        "weekNumber": 10,
        "phase": "Showcase",
        "lessons": [
          {
            "kind": "core",
            "title": "Showcase and Reflection"
          },
          {
            "kind": "lab",
            "title": "Peer Review and Aim Higher"
          }
        ],
        "strand": "All four strands",
        "secures": "Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.",
        "stretch": "Students identify their own next target from the strand profile the rubric produces."
      }
    ],
    "bridging": [
      {
        "week": "1",
        "weekNumber": 1,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Four Qualities and Trade-offs"
          },
          {
            "kind": "lab",
            "title": "Weighted Evaluation"
          }
        ],
        "strand": "AI Systems Understanding",
        "rebuildsTo": "Evaluates trade-offs (accuracy, efficiency, usability, reliability).",
        "frameworkRefs": [
          "AIF·CU·G11·A"
        ]
      },
      {
        "week": "2",
        "weekNumber": 2,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Optimise the Limiting Stage"
          },
          {
            "kind": "lab",
            "title": "Optimise Across Competing Demands"
          }
        ],
        "strand": "AI Solution Design & Development",
        "rebuildsTo": "Optimises solutions to improve efficiency, usability, and performance.",
        "frameworkRefs": [
          "AIF·SD·G11·A"
        ]
      },
      {
        "week": "3",
        "weekNumber": 3,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Justify with Data"
          },
          {
            "kind": "lab",
            "title": "Defend with a Connected Argument"
          }
        ],
        "strand": "Critical Evaluation & Informed Interaction",
        "rebuildsTo": "Justifies improvements using data and structured reasoning.",
        "frameworkRefs": [
          "AIF·CE·G11·A"
        ]
      },
      {
        "week": "4",
        "weekNumber": 4,
        "phase": null,
        "lessons": [
          {
            "kind": "core",
            "title": "Responsible-Use Approaches"
          },
          {
            "kind": "lab",
            "title": "Responsible Use for an Integrated System"
          }
        ],
        "strand": "Governance, Ethics & Societal Impact",
        "rebuildsTo": "Proposes responsible-use approaches considering broader impact.",
        "frameworkRefs": [
          "AIF·GE·G11·A"
        ]
      },
      {
        "week": "5 Integrate 1",
        "weekNumber": 5,
        "phase": "Integrate 1",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Design, Build, Evaluate, Justify"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.",
        "frameworkRefs": [
          "AIF·CU·G11·A",
          "AIF·SD·G11·A",
          "AIF·CE·G11·A",
          "AIF·GE·G11·A"
        ]
      },
      {
        "week": "6 Integrate 2",
        "weekNumber": 6,
        "phase": "Integrate 2",
        "lessons": [
          {
            "kind": "lesson",
            "title": "Integrated: Evaluate, Justify, Showcase"
          }
        ],
        "strand": "Integration – all four prior-grade strands",
        "rebuildsTo": "Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.",
        "frameworkRefs": [
          "AIF·CU·G11·A",
          "AIF·SD·G11·A",
          "AIF·CE·G11·A",
          "AIF·GE·G11·A"
        ]
      }
    ]
  }
};

/* ==========================================================================
 * Auth.gs
 * ========================================================================== */

/**
 * Identity and authorisation.
 *
 * SECURITY MODEL
 * --------------
 * The web app is deployed with `executeAs: USER_DEPLOYING` and `access: DOMAIN`
 * (see appsscript.json). That combination is deliberate and must not be changed:
 *
 *   - `access: DOMAIN` makes Google itself refuse anyone outside the Workspace
 *     domain. An unauthenticated or personal Gmail user never reaches our code.
 *   - `executeAs: USER_DEPLOYING` means the script touches the datastore with the
 *     deploying admin's authority, so students never need — and never get — direct
 *     access to the spreadsheet holding everyone's marks.
 *
 * If this were flipped to `executeAs: USER_ACCESSING`, every student would need
 * write access to the marks workbook and could edit their own scores directly in
 * Sheets, bypassing the app entirely. Do not flip it.
 *
 * Because the script owner and the accessing user share a domain,
 * `Session.getActiveUser().getEmail()` still returns the real signed-in student.
 * That value comes from Google, not from the browser, so it cannot be spoofed by
 * the client.
 */

const ROLES = { STUDENT: 'student', TEACHER: 'teacher', ADMIN: 'admin' };

/**
 * Resolves the caller. Throws if the caller is not a valid domain user.
 * Every entry point in Api.gs calls this before doing anything else.
 *
 * @return {{email: string, displayName: string, role: string, grade: string, className: string}}
 */
function getCurrentUser() {
  const email = (Session.getActiveUser().getEmail() || '').toLowerCase().trim();

  if (!email) {
    // Google could not tell us who this is. Never fall back to a guest identity.
    throw new Error('NOT_SIGNED_IN');
  }
  if (!isAllowedDomain_(email)) {
    logAudit_(email, 'ACCESS_DENIED', 'Domain not permitted');
    throw new Error('DOMAIN_NOT_ALLOWED');
  }

  const role = resolveRole_(email);
  const rosterEntry = findRosterEntry_(email);

  return {
    email: email,
    displayName: (rosterEntry && rosterEntry.displayName) || deriveNameFromEmail_(email),
    role: role,
    grade: (rosterEntry && rosterEntry.grade) || '',
    className: (rosterEntry && rosterEntry.className) || ''
  };
}

/**
 * Exact-suffix domain check.
 * Uses '@' + domain rather than a bare `endsWith(domain)` so a lookalike
 * domain such as `notaisa.sch.ae` cannot satisfy it.
 */
function isAllowedDomain_(email) {
  return email.slice(-(CONFIG.ALLOWED_DOMAIN.length + 1)) === '@' + CONFIG.ALLOWED_DOMAIN;
}

/**
 * Role lookup. Anyone on the domain who is not listed in the Staff sheet is a
 * student — staff are the exception that must be granted, not the default.
 *
 * The person who deployed the script is always an admin, so the very first
 * sign-in can bootstrap the Staff sheet without manual spreadsheet editing.
 */
function resolveRole_(email) {
  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase().trim();
  if (email === owner) return ROLES.ADMIN;

  const staff = readSheetObjects_(SHEETS.STAFF);
  const match = staff.filter(function (row) {
    return String(row.email || '').toLowerCase().trim() === email;
  })[0];

  if (!match) return ROLES.STUDENT;

  const role = String(match.role || '').toLowerCase().trim();
  return (role === ROLES.ADMIN || role === ROLES.TEACHER) ? role : ROLES.STUDENT;
}

/** True when the user may view other students' data. */
function isStaff_(user) {
  return user.role === ROLES.TEACHER || user.role === ROLES.ADMIN;
}

/** Throws unless the user is staff. Guards every teacher/admin endpoint. */
function requireStaff_(user) {
  if (!isStaff_(user)) {
    logAudit_(user.email, 'FORBIDDEN', 'Attempted staff-only action');
    throw new Error('FORBIDDEN');
  }
}

/** Throws unless the user is an admin. Guards roster and staff management. */
function requireAdmin_(user) {
  if (user.role !== ROLES.ADMIN) {
    logAudit_(user.email, 'FORBIDDEN', 'Attempted admin-only action');
    throw new Error('FORBIDDEN');
  }
}

/** "jane.smith@aisa.sch.ae" -> "Jane Smith". Only used when no roster name exists. */
function deriveNameFromEmail_(email) {
  return email.split('@')[0]
    .split(/[._-]+/)
    .filter(function (part) { return part.length; })
    .map(function (part) { return part.charAt(0).toUpperCase() + part.slice(1); })
    .join(' ');
}

/* ==========================================================================
 * Db.gs
 * ========================================================================== */

/**
 * Datastore layer over Google Sheets.
 *
 * Sheets is not a database, so the access patterns here are deliberately narrow:
 * whole-sheet reads (cheap, one API call) filtered in memory, and writes
 * serialised behind a document lock so two students submitting at the same moment
 * cannot interleave and corrupt a row.
 *
 * Row shape is defined once in COLUMNS (Config.gs); everything here works from
 * that, so adding a column is a one-line change plus a migration run.
 */

/** Opens the datastore workbook, creating it on first run. */
function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(CONFIG.PROP_SPREADSHEET_ID);

  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (err) {
      // Stored ID is stale (workbook deleted or access lost). Fall through and rebuild.
      console.warn('Stored spreadsheet ID unusable, creating a new datastore: ' + err.message);
    }
  }

  const ss = SpreadsheetApp.create(CONFIG.APP_NAME + ' — Datastore');
  props.setProperty(CONFIG.PROP_SPREADSHEET_ID, ss.getId());
  ensureSchema_(ss);
  return ss;
}

/** Creates any missing sheet and writes its header row. Safe to call repeatedly. */
function ensureSchema_(ss) {
  ss = ss || getSpreadsheet_();

  Object.keys(SHEETS).forEach(function (key) {
    const name = SHEETS[key];
    const headers = COLUMNS[key];
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#21076C')
        .setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
  });

  // Remove the default empty sheet left behind by SpreadsheetApp.create().
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }
  return ss;
}

/**
 * Reads a whole sheet as an array of objects keyed by header name.
 *
 * @param {string} sheetName
 * @param {boolean=} useCache Cache for CONFIG.CACHE_SECONDS. Only pass true for
 *   slow-changing reference data (Staff, Roster) — never for marks.
 */
function readSheetObjects_(sheetName, useCache) {
  const cacheKey = 'sheet:' + sheetName;
  const cache = CacheService.getScriptCache();

  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit) {
      try { return JSON.parse(hit); } catch (e) { /* corrupt entry, fall through */ }
    }
  }

  const sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = {};
    let blank = true;
    for (let c = 0; c < headers.length; c++) {
      const v = values[i][c];
      row[headers[c]] = v;
      if (v !== '' && v !== null) blank = false;
    }
    if (!blank) {
      row._rowIndex = i + 1; // 1-based sheet row, for targeted updates
      rows.push(row);
    }
  }

  if (useCache) {
    try {
      cache.put(cacheKey, JSON.stringify(rows), CONFIG.CACHE_SECONDS);
    } catch (e) {
      // Over the 100KB cache ceiling — not fatal, just means we read live next time.
    }
  }
  return rows;
}

/** Drops the cached copy of a sheet after a write that changed it. */
function invalidateCache_(sheetName) {
  CacheService.getScriptCache().remove('sheet:' + sheetName);
}

/** Appends one row, mapping an object onto the sheet's column order. */
function appendRow_(sheetKey, obj) {
  const sheetName = SHEETS[sheetKey];
  const headers = COLUMNS[sheetKey];
  const sheet = getSpreadsheet_().getSheetByName(sheetName) ||
                ensureSchema_().getSheetByName(sheetName);

  const row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
  sheet.appendRow(row);
  invalidateCache_(sheetName);
}

/** Overwrites one existing row in place, identified by its 1-based sheet index. */
function updateRow_(sheetKey, rowIndex, obj) {
  const sheetName = SHEETS[sheetKey];
  const headers = COLUMNS[sheetKey];
  const sheet = getSpreadsheet_().getSheetByName(sheetName);

  const row = headers.map(function (h) {
    return obj[h] === undefined || obj[h] === null ? '' : obj[h];
  });
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
  invalidateCache_(sheetName);
}

/**
 * Runs a write inside a document lock.
 *
 * Without this, thirty students hitting Submit at the end of a lesson can read
 * the same "last row", then each append over the others. The lock makes those
 * writes queue instead. Waits up to 20s, which comfortably covers a class-sized
 * burst; beyond that we surface a retryable error rather than risk a lost mark.
 */
function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) {
    throw new Error('BUSY');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/** Roster lookup for one student. */
function findRosterEntry_(email) {
  const roster = readSheetObjects_(SHEETS.ROSTER, true);
  return roster.filter(function (r) {
    return String(r.email || '').toLowerCase().trim() === email;
  })[0] || null;
}

/** Appends an audit entry. Never throws — logging must not break a lesson. */
function logAudit_(actor, action, detail) {
  try {
    appendRow_('AUDIT', {
      timestamp: new Date(),
      actor: actor || 'unknown',
      action: action,
      detail: detail || ''
    });
  } catch (err) {
    console.error('Audit write failed: ' + err.message);
  }
}

/* ==========================================================================
 * Content.gs
 * ========================================================================== */

/**
 * Curriculum content access.
 *
 * The curriculum itself lives in `curriculum/**` as plain JSON and is compiled
 * into `generated/CurriculumData.gs` by `npm run build`. Apps Script projects can
 * only hold .gs and .html files, so the build wraps the JSON rather than us
 * authoring lessons as code. The JSON stays the source of truth and stays
 * portable if the platform ever moves off Apps Script.
 */

/** Returns the course shell for a grade: units, lesson titles, standards. No answers. */
function getCourse_(gradeKey) {
  const course = CURRICULUM[gradeKey];
  if (!course) throw new Error('UNKNOWN_GRADE');
  return course;
}

/** Every lesson in a grade, in teaching order. */
function listLessons_(gradeKey) {
  const course = getCourse_(gradeKey);
  const ordered = [];
  (course.units || []).forEach(function (unit) {
    (unit.lessons || []).forEach(function (lessonId) {
      const lesson = course.lessons[lessonId];
      if (lesson) ordered.push(lesson);
    });
  });
  return ordered;
}

/** The authoritative lesson, answer keys intact. Server-side use only. */
function getLessonAuthoritative_(gradeKey, lessonId) {
  const course = getCourse_(gradeKey);
  const lesson = course.lessons[lessonId];
  if (!lesson) throw new Error('UNKNOWN_LESSON');
  return lesson;
}

/**
 * The student-safe copy of a lesson.
 *
 * This is the only version that ever crosses to a browser. Without the stripping
 * below, a student could open devtools and read every answer straight out of the
 * page payload, which would make the marks meaningless.
 */
function getLessonForStudent_(gradeKey, lessonId) {
  const lesson = getLessonAuthoritative_(gradeKey, lessonId);
  return stripAnswerKey_(lesson);
}

/** Deep-copies a lesson, removing every field that reveals or hints at an answer. */
function stripAnswerKey_(lesson) {
  const copy = JSON.parse(JSON.stringify(lesson));

  if (copy.worksheet && copy.worksheet.questions) {
    copy.worksheet.questions = copy.worksheet.questions.map(function (q) {
      const safe = {
        id: q.id,
        type: q.type,
        prompt: q.prompt,
        marks: q.marks,
        standards: q.standards || [],
        hint: q.hint || '',
        // The student needs to know this part is read rather than marked.
        // `lookFor` is deliberately NOT carried over: it is the teacher's guidance.
        autoMarked: q.autoMarked !== false
      };
      if (q.stem) safe.stem = q.stem;

      // Presentation data the student legitimately needs in order to answer.
      if (q.options) {
        safe.options = q.options.map(function (o) { return { id: o.id, text: o.text }; });
      }
      if (q.left)  safe.left  = q.left.map(function (o) { return { id: o.id, text: o.text }; });
      if (q.right) safe.right = q.right.map(function (o) { return { id: o.id, text: o.text }; });
      if (q.items) safe.items = shuffle_(q.items.map(function (o) {
        return { id: o.id, text: o.text };
      }));
      if (q.blanks)      safe.blanks = q.blanks;
      if (q.placeholder) safe.placeholder = q.placeholder;
      if (q.maxLength)   safe.maxLength = q.maxLength;

      return safe;
    });
  }
  return copy;
}

/**
 * Fisher-Yates. Ordering questions ship shuffled, otherwise the items arrive in
 * the correct sequence and the question marks itself.
 */
function shuffle_(array) {
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

/**
 * The four strand definitions for a grade, keyed by strand code, each carrying
 * the official Emerging / Proficient / Advanced descriptors.
 *
 * This reads the framework catalogue extracted from ADEK's Scope & Sequence, not
 * anything authored locally — the descriptors a teacher judges against must be
 * ADEK's own wording, verbatim.
 */
function getStandardsIndex_(gradeKey) {
  return (FRAMEWORK.grades && FRAMEWORK.grades[gradeKey]) || {};
}

/** One strand's definition, or null. */
function getStrand_(gradeKey, strandCode) {
  return getStandardsIndex_(gradeKey)[String(strandCode).toUpperCase()] || null;
}

/** The published week-by-week sequence for a grade and track ('main'|'bridging'). */
function getSequence_(gradeKey, track) {
  const seq = (typeof SEQUENCES !== 'undefined' && SEQUENCES[gradeKey]) || {};
  return seq[track] || [];
}

/** Total marks available across a whole grade — the denominator for overall progress. */
function getTotalMarksForGrade_(gradeKey) {
  return listLessons_(gradeKey).reduce(function (sum, lesson) {
    const questions = (lesson.worksheet && lesson.worksheet.questions) || [];
    return sum + questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
  }, 0);
}

/* ==========================================================================
 * Marking.gs
 * ========================================================================== */

/**
 * Auto-marking engine.
 *
 * Marking always happens on the server against the authoritative copy of the
 * content. Answer keys are stripped before any lesson is sent to a browser
 * (see stripAnswerKey_ in Content.gs), so a student cannot read the answers out
 * of the page source, and a crafted request cannot award itself marks — the
 * client only ever submits responses, never scores.
 *
 * Supported question types and how each is credited:
 *
 *   mcq        single correct option           all or nothing
 *   truefalse  a boolean                       all or nothing
 *   multi      several correct options         partial credit, penalised for wrong picks
 *   matching   left/right pairs                partial credit per correct pair
 *   ordering   a correct sequence              partial credit per item in the right place
 *   numeric    a value with a tolerance        all or nothing, tolerance-aware
 *   shortText  accepted answers / keywords     normalised comparison
 *   fillBlank  several short answers in a row  partial credit per blank
 *
 * A question may also set `autoMarked: false`. Much of the published curriculum is
 * open sentence stems — "The data problem is ___. So the model learns ___." —
 * whose quality no mark scheme can judge. Those are captured verbatim, carry no
 * marks, are excluded from the worksheet score entirely, and are surfaced to the
 * teacher as product evidence toward their own judgement.
 *
 * Keyword-matching them instead would hand out marks for using the right
 * vocabulary about the wrong thing, and would put a number where the framework
 * puts a judgement.
 */

/**
 * Marks a full worksheet submission.
 *
 * @param {Object} worksheet Authoritative worksheet definition (with answer keys).
 * @param {Object} answers   Map of questionId -> student response.
 * @return {{marksAwarded:number, marksAvailable:number, percent:number, results:Array}}
 */
function markWorksheet_(worksheet, answers) {
  answers = answers || {};
  const results = [];
  let awarded = 0;
  let available = 0;

  let openResponses = 0;

  (worksheet.questions || []).forEach(function (question) {
    const response = answers[question.id];
    const result = markQuestion_(question, response);
    results.push(result);

    // Open responses contribute to neither side of the fraction, so a worksheet
    // that is mostly open does not report a misleadingly small score.
    if (result.needsTeacherReview) { openResponses++; return; }
    awarded += result.marksAwarded;
    available += result.marksAvailable;
  });

  return {
    marksAwarded: round2_(awarded),
    marksAvailable: round2_(available),
    percent: available > 0 ? round2_((awarded / available) * 100) : 0,
    openResponses: openResponses,
    results: results
  };
}

/** Marks a single question, dispatching on its type. */
function markQuestion_(question, response) {
  const marksAvailable = Number(question.marks) || 0;
  let awarded = 0;

  const answered = response !== undefined && response !== null && response !== '' &&
                   !(Array.isArray(response) && response.length === 0);

  // Captured, never scored. The teacher reads it as evidence.
  if (question.autoMarked === false) {
    return {
      questionId: question.id,
      type: question.type,
      answered: answered,
      correct: false,
      partial: false,
      needsTeacherReview: true,
      marksAwarded: 0,
      marksAvailable: 0,
      standards: question.standards || [],
      frameworkRefs: question.frameworkRefs || [],
      response: answered ? response : null,
      // What the published pack tells a teacher to look for, shown beside the response.
      lookFor: question.lookFor || '',
      feedback: answered
        ? 'Your teacher will read this response.'
        : 'You did not answer this part.',
      modelAnswer: ''
    };
  }

  if (answered) {
    switch (question.type) {
      case 'mcq':       awarded = markChoice_(question, response) * marksAvailable; break;
      case 'truefalse': awarded = markTrueFalse_(question, response) * marksAvailable; break;
      case 'multi':     awarded = markMulti_(question, response) * marksAvailable; break;
      case 'matching':  awarded = markMatching_(question, response) * marksAvailable; break;
      case 'ordering':  awarded = markOrdering_(question, response) * marksAvailable; break;
      case 'numeric':   awarded = markNumeric_(question, response) * marksAvailable; break;
      case 'shortText': awarded = markShortText_(question, response) * marksAvailable; break;
      case 'fillBlank': awarded = markFillBlank_(question, response) * marksAvailable; break;
      default:
        console.warn('Unknown question type "' + question.type + '" on ' + question.id);
        awarded = 0;
    }
  }

  awarded = round2_(Math.max(0, Math.min(awarded, marksAvailable)));
  const fraction = marksAvailable > 0 ? awarded / marksAvailable : 0;

  return {
    questionId: question.id,
    type: question.type,
    answered: answered,
    correct: fraction >= 0.999,
    partial: fraction > 0 && fraction < 0.999,
    marksAwarded: awarded,
    marksAvailable: marksAvailable,
    standards: question.standards || [],
    frameworkRefs: question.frameworkRefs || [],
    needsTeacherReview: false,
    feedback: pickFeedback_(question, fraction, answered),
    // The model answer is released only after marking, so students learn from mistakes.
    modelAnswer: describeAnswer_(question)
  };
}

/* ---------------------------------------------------------------------------
 * Per-type markers. Each returns a fraction of the available marks, 0..1.
 * ------------------------------------------------------------------------- */

function markChoice_(question, response) {
  return String(response).trim() === String(question.answer).trim() ? 1 : 0;
}

function markTrueFalse_(question, response) {
  return toBool_(response) === toBool_(question.answer) ? 1 : 0;
}

/**
 * Multi-select.
 *
 * Credit is (proportion of correct options found) minus (proportion of
 * distractors wrongly selected), floored at zero. Scoring the two proportions
 * against their own totals is what makes ticking every box score exactly zero:
 * it earns 1 for finding them all and loses 1 for taking every distractor.
 *
 * A simpler (hits - misses) / correctCount does not hold that property — with
 * three correct options and two distractors, ticking everything would still pay
 * out a third of the marks for pure guessing.
 */
function markMulti_(question, response) {
  const key = (question.answer || []).map(normaliseKey_);
  const given = (Array.isArray(response) ? response : [response]).map(normaliseKey_);
  if (key.length === 0) return 0;

  const distractorCount = Math.max(0, (question.options || []).length - key.length);
  const unique = given.filter(function (v, i) { return given.indexOf(v) === i; });

  let hits = 0, misses = 0;
  unique.forEach(function (v) {
    if (key.indexOf(v) !== -1) hits++; else misses++;
  });

  // With no distractors there is nothing to wrongly select, so no penalty applies.
  const penalty = distractorCount > 0 ? (misses / distractorCount) : 0;
  return Math.max(0, (hits / key.length) - penalty);
}

/** Matching pairs: response is { leftId: rightId }. Credit per correct pair. */
function markMatching_(question, response) {
  const key = question.answer || {};
  const keys = Object.keys(key);
  if (keys.length === 0) return 0;
  if (typeof response !== 'object' || response === null) return 0;

  let hits = 0;
  keys.forEach(function (leftId) {
    if (normaliseKey_(response[leftId]) === normaliseKey_(key[leftId])) hits++;
  });
  return hits / keys.length;
}

/** Ordering: credit for each item sitting in its correct position. */
function markOrdering_(question, response) {
  const key = (question.answer || []).map(normaliseKey_);
  const given = (Array.isArray(response) ? response : []).map(normaliseKey_);
  if (key.length === 0) return 0;

  let hits = 0;
  for (let i = 0; i < key.length; i++) {
    if (given[i] === key[i]) hits++;
  }
  return hits / key.length;
}

/** Numeric with an inclusive tolerance (absolute, defaults to exact). */
function markNumeric_(question, response) {
  const expected = Number(question.answer);
  const given = Number(String(response).replace(/[, ]/g, ''));
  if (isNaN(given) || isNaN(expected)) return 0;

  const tolerance = Number(question.tolerance) || 0;
  return Math.abs(given - expected) <= tolerance + 1e-9 ? 1 : 0;
}

/**
 * Short free text. Three matching strategies, in order of preference:
 *
 *   acceptedAnswers  normalised exact match against any listed answer
 *   keywordsAll      every listed keyword must appear (credit is all-or-nothing)
 *   keywordsAny      credit scales with how many listed keywords appear
 *
 * Normalisation strips case, punctuation and filler words so that
 * "A computer program!" and "computer program" both match.
 */
function markShortText_(question, response) {
  const text = normaliseText_(response);
  if (!text) return 0;

  if (question.acceptedAnswers && question.acceptedAnswers.length) {
    const matched = question.acceptedAnswers.some(function (accepted) {
      return normaliseText_(accepted) === text;
    });
    if (matched) return 1;
    // Fall through: a longer sentence containing an accepted answer still counts.
    const contained = question.acceptedAnswers.some(function (accepted) {
      const norm = normaliseText_(accepted);
      return norm.length > 2 && text.indexOf(norm) !== -1;
    });
    if (contained) return 1;
  }

  if (question.keywordsAll && question.keywordsAll.length) {
    const all = question.keywordsAll.every(function (kw) {
      return text.indexOf(normaliseText_(kw)) !== -1;
    });
    return all ? 1 : 0;
  }

  if (question.keywordsAny && question.keywordsAny.length) {
    const hits = question.keywordsAny.filter(function (kw) {
      return text.indexOf(normaliseText_(kw)) !== -1;
    }).length;
    const needed = Number(question.keywordsNeeded) || 1;
    return Math.min(1, hits / needed);
  }

  return 0;
}

/** A row of blanks: response is an array, credit per blank filled correctly. */
function markFillBlank_(question, response) {
  const blanks = question.answer || [];
  if (blanks.length === 0) return 0;
  const given = Array.isArray(response) ? response : [response];

  let hits = 0;
  blanks.forEach(function (accepted, i) {
    const options = Array.isArray(accepted) ? accepted : [accepted];
    const answer = normaliseText_(given[i]);
    if (answer && options.some(function (o) { return normaliseText_(o) === answer; })) {
      hits++;
    }
  });
  return hits / blanks.length;
}

/* ---------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

/** Lowercase, strip punctuation and filler words, collapse whitespace. */
function normaliseText_(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\b(a|an|the|is|are|it|that|this|of|to)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Identifier comparison — case and whitespace insensitive, punctuation preserved. */
function normaliseKey_(value) {
  if (value === undefined || value === null) return '';
  return String(value).toLowerCase().trim();
}

function toBool_(value) {
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase().trim();
  return s === 'true' || s === 'yes' || s === '1' || s === 't';
}

/** Chooses the feedback line a student sees for this question after marking. */
function pickFeedback_(question, fraction, answered) {
  const fb = question.feedback || {};
  if (!answered) return fb.unanswered || 'You did not answer this question.';
  if (fraction >= 0.999) return fb.correct || 'Correct.';
  if (fraction > 0) return fb.partial || fb.incorrect || 'Partly right — check the model answer.';
  return fb.incorrect || 'Not quite — check the model answer.';
}

/** Renders the answer key into something readable for post-submission review. */
function describeAnswer_(question) {
  switch (question.type) {
    case 'mcq': {
      const opt = (question.options || []).filter(function (o) {
        return String(o.id) === String(question.answer);
      })[0];
      return opt ? opt.text : String(question.answer);
    }
    case 'truefalse':
      return toBool_(question.answer) ? 'True' : 'False';
    case 'multi': {
      const byId = {};
      (question.options || []).forEach(function (o) { byId[String(o.id)] = o.text; });
      return (question.answer || []).map(function (id) {
        return byId[String(id)] || id;
      }).join('; ');
    }
    case 'matching': {
      const key = question.answer || {};
      const leftText = {}, rightText = {};
      (question.left || []).forEach(function (o) { leftText[String(o.id)] = o.text; });
      (question.right || []).forEach(function (o) { rightText[String(o.id)] = o.text; });
      return Object.keys(key).map(function (l) {
        return (leftText[l] || l) + ' → ' + (rightText[String(key[l])] || key[l]);
      }).join('; ');
    }
    case 'ordering': {
      const text = {};
      (question.items || []).forEach(function (o) { text[String(o.id)] = o.text; });
      return (question.answer || []).map(function (id, i) {
        return (i + 1) + '. ' + (text[String(id)] || id);
      }).join('  ');
    }
    case 'numeric':
      return String(question.answer) +
        (question.tolerance ? ' (±' + question.tolerance + ')' : '');
    case 'fillBlank':
      return (question.answer || []).map(function (a) {
        return Array.isArray(a) ? a[0] : a;
      }).join(', ');
    case 'shortText':
      return question.modelAnswer ||
        (question.acceptedAnswers || []).join(' / ') ||
        (question.keywordsAll || question.keywordsAny || []).join(', ');
    default:
      return '';
  }
}

function round2_(n) {
  return Math.round(n * 100) / 100;
}

/* ==========================================================================
 * Attainment.gs
 * ========================================================================== */

/**
 * Attainment against the ADEK AI Fluency Framework.
 *
 * THE RULE THAT GOVERNS THIS FILE
 * ------------------------------
 * A level is awarded by a teacher, against a written descriptor, from triangulated
 * evidence. It is never computed from marks. ADEK publishes no mark-to-tier
 * conversion for any grade, and inventing one is what would make the school's
 * records indefensible.
 *
 * So there is deliberately no function here that turns a percentage into a level.
 * Worksheet marks appear only as `products` evidence — one of the three sources a
 * judgement must draw on — and are always labelled as such.
 *
 * What this module does do is the arithmetic teachers should not have to: apply
 * each grade's published overall-level decision rule consistently, and roll
 * judgements up across a class.
 */

/**
 * Applies a grade's published decision rule to a set of strand levels.
 *
 * Returns the rule text alongside the level so the teacher view can show WHY a
 * student is at a level — which is what makes the record auditable and the
 * published tie-break cases self-evidently handled.
 *
 * @param {Object} strandLevels e.g. { CU: 'emerging', SD: 'proficient', ... }
 * @param {string} gradeKey     e.g. 'grade6'
 * @return {{level: ?string, label: string, rule: string, reason: ?string}}
 */
function overallLevelFrom_(strandLevels, gradeKey) {
  const config = CONFIG.GRADE_RULES[gradeKey];
  if (!config) {
    return { level: null, label: 'No rule published', rule: '', reason: 'no_rule_for_grade' };
  }

  const strands = CONFIG.STRANDS;
  const missing = strands.filter(function (s) {
    return !strandLevels[s] || LEVEL_ORDINAL[strandLevels[s]] === undefined;
  });

  // An overall level before every strand is judged would be a guess. Say so instead.
  if (missing.length) {
    return {
      level: null,
      label: 'Not yet complete',
      rule: '',
      reason: 'incomplete',
      missingStrands: missing
    };
  }

  const ordinalOf = function (s) { return LEVEL_ORDINAL[strandLevels[s]]; };
  const countAtOrAbove = function (levelKey) {
    return strands.filter(function (s) { return ordinalOf(s) >= LEVEL_ORDINAL[levelKey]; }).length;
  };
  const noneBelow = function (levelKey) {
    return levelKey === null ||
      strands.every(function (s) { return ordinalOf(s) >= LEVEL_ORDINAL[levelKey]; });
  };

  for (let i = 0; i < config.rules.length; i++) {
    const rule = config.rules[i];
    if (countAtOrAbove(rule.atOrAbove.level) >= rule.atOrAbove.count && noneBelow(rule.floor)) {
      const def = levelDef_(rule.level);
      return {
        level: rule.level,
        label: def ? def.label : rule.level,
        color: def ? def.color : null,
        rule: rule.text,
        isExpected: rule.level === config.expectedTier,
        reason: null
      };
    }
  }

  const def = levelDef_('working_towards');
  return {
    level: 'working_towards',
    label: def.label,
    color: def.color,
    rule: 'Does not yet meet the ' + gradeKey.replace('grade', 'Grade ') +
          ' rule for Emerging.',
    isExpected: false,
    reason: null
  };
}

/**
 * Builds a student's strand profile from their judgement rows.
 *
 * Judgements are append-only, so the current picture is the most recent row per
 * strand that nothing supersedes. Earlier rows stay as history — a re-check after
 * bridging should be visible as a change, not erase what came before.
 *
 * @param {string} gradeKey
 * @param {Array}  judgements Rows from the Judgements sheet for one student.
 * @param {string=} assessmentEvent Restrict to one event (e.g. 'final').
 */
function buildStrandProfile_(gradeKey, judgements, assessmentEvent) {
  const relevant = (judgements || []).filter(function (row) {
    if (String(row.scale) !== 'summative_tier') return false;
    if (row.supersededBy) return false;
    if (assessmentEvent && String(row.assessmentEvent) !== assessmentEvent) return false;
    return true;
  });

  const latest = {};
  relevant.forEach(function (row) {
    const strand = String(row.strand || '').toUpperCase();
    if (CONFIG.STRANDS.indexOf(strand) === -1) return;
    const at = row.judgedAt ? new Date(row.judgedAt).getTime() : 0;
    if (!latest[strand] || at >= latest[strand]._at) {
      latest[strand] = { row: row, _at: at };
    }
  });

  const standardsIndex = getStandardsIndex_(gradeKey);
  const strandLevels = {};

  const byStrand = CONFIG.STRANDS.map(function (strand) {
    const entry = latest[strand];
    const definition = standardsIndex[strand] || {};
    if (entry) strandLevels[strand] = String(entry.row.level);

    const sources = entry ? [
      entry.row.evidenceProducts ? 'products' : null,
      entry.row.evidenceObservations ? 'observations' : null,
      entry.row.evidenceConversations ? 'conversations' : null
    ].filter(Boolean) : [];

    const levelKey = entry ? String(entry.row.level) : null;
    const def = levelKey ? levelDef_(levelKey) : null;

    return {
      strand: strand,
      label: definition.label || strand,
      descriptors: definition.tiers || null,
      level: levelKey,
      levelLabel: def ? def.label : 'Not yet judged',
      levelColor: def ? def.color : null,
      judged: !!entry,
      note: entry ? String(entry.row.note || '') : '',
      nextStep: entry ? String(entry.row.nextStep || '') : '',
      accessArrangements: entry ? String(entry.row.accessArrangements || '') : '',
      frameworkRefs: entry ? String(entry.row.frameworkRefs || '') : '',
      judgedBy: entry ? String(entry.row.judgedBy || '') : '',
      judgedAt: entry ? entry.row.judgedAt : null,
      evidenceSources: sources,
      // ADEK requires three sources. Flag a thin judgement rather than blocking it.
      singleSource: entry ? sources.length < 2 : false,
      missingSources: entry
        ? CONFIG.EVIDENCE_SOURCES
            .map(function (s) { return s.key; })
            .filter(function (k) { return sources.indexOf(k) === -1; })
        : []
    };
  });

  return {
    byStrand: byStrand,
    overall: overallLevelFrom_(strandLevels, gradeKey),
    expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null,
    judgedCount: byStrand.filter(function (s) { return s.judged; }).length,
    strandsTotal: CONFIG.STRANDS.length
  };
}

/**
 * Summarises worksheet marks as PRODUCT evidence for a strand.
 *
 * This deliberately returns no level and no band. It answers "what has this
 * student produced that bears on this strand", which is what a teacher needs in
 * front of them while judging — not "what level are they".
 *
 * `bestOfAttempts` is surfaced because a correct third attempt is not evidence of
 * independence, which the moderation guidance names as a pitfall.
 */
function worksheetEvidenceByStrand_(gradeKey, submissions) {
  const totals = {};
  CONFIG.STRANDS.forEach(function (s) {
    totals[s] = { marksAwarded: 0, marksAvailable: 0, items: 0, lessons: {}, maxAttempt: 0 };
  });

  (submissions || []).forEach(function (submission) {
    let results;
    try {
      results = JSON.parse(submission.resultsJson || '[]');
    } catch (err) {
      console.warn('Unparseable resultsJson for ' + submission.lessonId);
      return;
    }
    const attempt = Number(submission.attempt) || 1;

    results.forEach(function (result) {
      strandsOfResult_(result).forEach(function (strand) {
        if (!totals[strand]) return;
        totals[strand].marksAwarded += Number(result.marksAwarded) || 0;
        totals[strand].marksAvailable += Number(result.marksAvailable) || 0;
        totals[strand].items += 1;
        totals[strand].lessons[submission.lessonId] = true;
        totals[strand].maxAttempt = Math.max(totals[strand].maxAttempt, attempt);
      });
    });
  });

  return CONFIG.STRANDS.map(function (strand) {
    const t = totals[strand];
    return {
      strand: strand,
      evidenceType: 'products',
      marksAwarded: round2_(t.marksAwarded),
      marksAvailable: round2_(t.marksAvailable),
      // A score on the worksheet, not an attainment figure. Named so it reads that way.
      worksheetScore: t.marksAvailable > 0
        ? round2_((t.marksAwarded / t.marksAvailable) * 100) : null,
      itemsMarked: t.items,
      lessonsCovered: Object.keys(t.lessons).length,
      highestAttemptUsed: t.maxAttempt,
      notIndependent: t.maxAttempt > 1
    };
  });
}

/** Reads the strand code(s) a marked result bears on, tolerating both tag shapes. */
function strandsOfResult_(result) {
  const refs = result.frameworkRefs || result.standards || [];
  const out = [];
  (Array.isArray(refs) ? refs : [refs]).forEach(function (ref) {
    const code = typeof ref === 'string' ? ref : (ref && ref.code) || '';
    const strand = typeof ref === 'object' && ref && ref.strand
      ? String(ref.strand).toUpperCase()
      : (/AIF·([A-Z]{2})·/.exec(String(code)) || [, ''])[1];
    if (strand && out.indexOf(strand) === -1) out.push(strand);
  });
  return out;
}

/**
 * Class rollup: for each strand, how many students sit at each level.
 *
 * This replaces the old cohort-average-then-band, which averaged marks across
 * students and strands and banded the result — a halo by construction, and the
 * pitfall the moderation guidance names first. A count per level is what actually
 * tells a teacher which strand to reteach.
 */
function computeClassProfile_(gradeKey, studentProfiles) {
  const standardsIndex = getStandardsIndex_(gradeKey);

  const byStrand = CONFIG.STRANDS.map(function (strand) {
    const counts = {};
    CONFIG.ATTAINMENT_LEVELS.forEach(function (l) { counts[l.key] = 0; });
    let notJudged = 0;

    studentProfiles.forEach(function (student) {
      const row = (student.profile.byStrand || []).filter(function (r) {
        return r.strand === strand;
      })[0];
      if (!row || !row.judged) { notJudged++; return; }
      if (counts[row.level] !== undefined) counts[row.level]++;
    });

    const definition = standardsIndex[strand] || {};
    return {
      strand: strand,
      label: definition.label || strand,
      descriptors: definition.tiers || null,
      notJudged: notJudged,
      distribution: CONFIG.ATTAINMENT_LEVELS.map(function (l) {
        return { level: l.key, label: l.label, color: l.color, count: counts[l.key] };
      })
    };
  });

  const overallCounts = {};
  CONFIG.ATTAINMENT_LEVELS.forEach(function (l) { overallCounts[l.key] = 0; });
  let incomplete = 0;

  studentProfiles.forEach(function (student) {
    const level = student.profile.overall.level;
    if (!level) incomplete++;
    else if (overallCounts[level] !== undefined) overallCounts[level]++;
  });

  return {
    byStrand: byStrand,
    overall: {
      incomplete: incomplete,
      distribution: CONFIG.ATTAINMENT_LEVELS.map(function (l) {
        return { level: l.key, label: l.label, color: l.color, count: overallCounts[l.key] };
      })
    },
    expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null
  };
}

// round2_ lives in Marking.gs; Apps Script shares one global scope across files.

/* ==========================================================================
 * Api.gs
 * ========================================================================== */

/**
 * Client-callable API.
 *
 * Everything the browser can invoke lives here and nowhere else. Each endpoint
 * re-resolves the caller from the Google session rather than trusting anything
 * sent by the page, so a student cannot ask for another student's data by
 * editing a request.
 *
 * Every function returns an envelope — { ok: true, data } or { ok: false, error } —
 * because google.script.run's failure handler loses stack detail, and a student
 * mid-worksheet needs a usable message rather than a silent failure.
 */

/** Wraps an endpoint with auth, error handling and a consistent envelope. */
function handle_(fn) {
  try {
    const user = getCurrentUser();
    return { ok: true, data: fn(user) };
  } catch (err) {
    const code = err && err.message ? err.message : 'UNKNOWN';
    console.error(code + (err && err.stack ? '\n' + err.stack : ''));
    return { ok: false, error: code, message: friendlyError_(code) };
  }
}

function friendlyError_(code) {
  switch (code) {
    case 'NOT_SIGNED_IN':
      return 'We could not confirm your Google sign-in. Close the tab and open the link again.';
    case 'DOMAIN_NOT_ALLOWED':
      return 'This platform is only available to AISA accounts. Please sign in with your @' +
             CONFIG.ALLOWED_DOMAIN + ' account.';
    case 'FORBIDDEN':
      return 'You do not have permission to view that.';
    case 'BUSY':
      return 'The system is handling a lot of submissions right now. Please try again in a moment.';
    case 'UNKNOWN_LESSON':
      return 'That lesson could not be found.';
    case 'MAX_ATTEMPTS_REACHED':
      return 'You have used all your attempts at this worksheet.';
    case 'INVALID_STRAND':
      return 'That is not one of the four framework strands.';
    case 'INVALID_LEVEL':
      return 'That is not a valid attainment level.';
    default:
      return 'Something went wrong. Please tell your teacher if this keeps happening.';
  }
}

/* ---------------------------------------------------------------------------
 * Student endpoints
 * ------------------------------------------------------------------------- */

/** Everything the app needs on first paint: who you are, your course, your progress. */
function api_getBootstrap() {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const course = getCourse_(gradeKey);
    const lessons = listLessons_(gradeKey);
    const best = bestSubmissionsByLesson_(user.email);

    const lessonCards = lessons.map(function (lesson) {
      const submission = best[lesson.id];
      return {
        id: lesson.id,
        number: lesson.number,
        type: lesson.type,
        track: lesson.track || 'main',
        week: lesson.week || null,
        title: lesson.title,
        summary: lesson.summary || '',
        duration: lesson.duration || '',
        strand: lesson.strand || null,
        marksAvailable: worksheetTotal_(lesson),
        attempts: countAttempts_(user.email, lesson.id),
        maxAttempts: CONFIG.MAX_ATTEMPTS,
        // Status reflects what the student DID, not whether an outcome was secured.
        // Only a teacher can judge the latter, so nothing here implies a pass.
        status: submission ? 'submitted' : 'not-started',
        worksheetScore: submission ? Number(submission.percent) : null,
        marksAwarded: submission ? Number(submission.marksAwarded) : null
      };
    });

    return {
      user: user,
      app: { name: CONFIG.APP_NAME, school: CONFIG.SCHOOL_NAME, domain: CONFIG.ALLOWED_DOMAIN },
      course: { key: gradeKey, title: course.meta.title, grade: course.meta.grade },
      units: (course.units || []).map(function (unit) {
        return { id: unit.id, title: unit.title, summary: unit.summary || '',
                 track: unit.track || 'main', lessons: unit.lessons };
      }),
      lessons: lessonCards,
      levels: CONFIG.ATTAINMENT_LEVELS,
      profile: buildStrandProfile_(gradeKey, judgementsFor_(user.email))
    };
  });
}

/** Lesson content for study. Answer keys are stripped before this leaves the server. */
function api_getLesson(lessonId) {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const lesson = getLessonForStudent_(gradeKey, String(lessonId));
    const attempts = countAttempts_(user.email, lesson.id);
    const best = bestSubmissionsByLesson_(user.email)[lesson.id] || null;

    markLessonStarted_(user.email, lesson);

    return {
      lesson: lesson,
      attempts: attempts,
      maxAttempts: CONFIG.MAX_ATTEMPTS,
      canAttempt: attempts < CONFIG.MAX_ATTEMPTS,
      best: best ? {
        worksheetScore: Number(best.percent),
        marksAwarded: Number(best.marksAwarded),
        marksAvailable: Number(best.marksAvailable),
        submittedAt: best.submittedAt,
        results: safeParse_(best.resultsJson, []),
        answers: safeParse_(best.answersJson, {})
      } : null
    };
  });
}

/**
 * Marks a worksheet and records the attempt.
 *
 * The client sends only its answers. Scoring happens here against the
 * authoritative content, so the marks stored are ones this server computed.
 *
 * Deliberately returns no pass/fail: the marks are product evidence toward a
 * judgement a teacher will make, and telling a student they "passed" would
 * assert an outcome nobody has yet assessed.
 */
function api_submitWorksheet(lessonId, answers) {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const lesson = getLessonAuthoritative_(gradeKey, String(lessonId));

    return withLock_(function () {
      const attempts = countAttempts_(user.email, lesson.id);
      if (attempts >= CONFIG.MAX_ATTEMPTS) throw new Error('MAX_ATTEMPTS_REACHED');

      const marked = markWorksheet_(lesson.worksheet || { questions: [] }, answers || {});
      const now = new Date();

      appendRow_('SUBMISSIONS', {
        email: user.email,
        lessonId: lesson.id,
        track: lesson.track || 'main',
        attempt: attempts + 1,
        submittedAt: now,
        marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        percent: marked.percent,
        answersJson: JSON.stringify(answers || {}),
        resultsJson: JSON.stringify(marked.results)
      });

      recordProgress_(user.email, lesson, 'submitted', now);
      logAudit_(user.email, 'SUBMIT', lesson.id + ' attempt ' + (attempts + 1) +
                ' scored ' + marked.percent + '%');

      return {
        worksheetScore: marked.percent,
        marksAwarded: marked.marksAwarded,
        marksAvailable: marked.marksAvailable,
        results: marked.results,
        attempt: attempts + 1,
        attemptsRemaining: CONFIG.MAX_ATTEMPTS - (attempts + 1)
      };
    });
  });
}

/** The student's own strand profile and worksheet history. */
function api_getMyResults() {
  return handle_(function (user) {
    const gradeKey = gradeKeyFor_(user);
    const best = bestSubmissionsByLesson_(user.email);
    return {
      profile: buildStrandProfile_(gradeKey, judgementsFor_(user.email)),
      evidence: worksheetEvidenceByStrand_(gradeKey, valuesOf_(best)),
      levels: CONFIG.ATTAINMENT_LEVELS,
      lessons: listLessons_(gradeKey).map(function (lesson) {
        const s = best[lesson.id];
        return {
          id: lesson.id, number: lesson.number, title: lesson.title,
          type: lesson.type, track: lesson.track || 'main',
          worksheetScore: s ? Number(s.percent) : null,
          marksAwarded: s ? Number(s.marksAwarded) : null,
          marksAvailable: worksheetTotal_(lesson),
          submittedAt: s ? s.submittedAt : null
        };
      })
    };
  });
}

/* ---------------------------------------------------------------------------
 * Teacher endpoints
 * ------------------------------------------------------------------------- */

/** Cohort overview: one strand profile per student. No averages, no bands. */
function api_getClassOverview(className) {
  return handle_(function (user) {
    requireStaff_(user);
    const gradeKey = 'grade6';
    const roster = readSheetObjects_(SHEETS.ROSTER, true).filter(function (r) {
      if (String(r.active).toLowerCase() === 'false') return false;
      return !className || String(r.className) === String(className);
    });

    const judgementsByEmail = groupBy_(readSheetObjects_(SHEETS.JUDGEMENTS), function (row) {
      return String(row.email || '').toLowerCase().trim();
    });
    const submissionsByEmail = groupBy_(readSheetObjects_(SHEETS.SUBMISSIONS), function (row) {
      return String(row.email || '').toLowerCase().trim();
    });

    const students = roster.map(function (entry) {
      const email = String(entry.email || '').toLowerCase().trim();
      const rows = submissionsByEmail[email] || [];
      return {
        email: email,
        displayName: entry.displayName || deriveNameFromEmail_(email),
        className: entry.className || '',
        bridgingStrands: parseStrandList_(entry.bridgingStrands),
        profile: buildStrandProfile_(gradeKey, judgementsByEmail[email] || []),
        worksheetsSubmitted: distinct_(rows.map(function (r) { return r.lessonId; })).length,
        lastActive: latestDate_(rows)
      };
    });

    return {
      students: students,
      classProfile: computeClassProfile_(gradeKey, students),
      levels: CONFIG.ATTAINMENT_LEVELS,
      strands: getStandardsIndex_(gradeKey),
      expectedTier: (CONFIG.GRADE_RULES[gradeKey] || {}).expectedTier || null,
      lessonsTotal: listLessons_(gradeKey).length,
      classes: distinct_(readSheetObjects_(SHEETS.ROSTER, true).map(function (r) {
        return r.className;
      })).filter(Boolean)
    };
  });
}

/**
 * Everything a teacher needs to judge one student: the ADEK descriptors verbatim,
 * the current judgement if any, and the evidence gathered so far, each labelled
 * with which of the three sources it is.
 */
function api_getStudentDetail(email) {
  return handle_(function (user) {
    requireStaff_(user);
    const target = normaliseEmail_(email);
    const gradeKey = 'grade6';

    const submissions = readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (row) {
      return normaliseEmail_(row.email) === target;
    });
    const judgements = judgementsFor_(target);
    const best = bestByLesson_(submissions);
    const rosterEntry = findRosterEntry_(target);
    logAudit_(user.email, 'VIEW_STUDENT', target);

    return {
      student: {
        email: target,
        displayName: (rosterEntry && rosterEntry.displayName) || deriveNameFromEmail_(target),
        className: (rosterEntry && rosterEntry.className) || '',
        bridgingStrands: parseStrandList_(rosterEntry && rosterEntry.bridgingStrands)
      },
      profile: buildStrandProfile_(gradeKey, judgements),
      evidence: worksheetEvidenceByStrand_(gradeKey, valuesOf_(best)),
      levels: CONFIG.ATTAINMENT_LEVELS,
      evidenceSources: CONFIG.EVIDENCE_SOURCES,
      history: judgements
        .filter(function (j) { return String(j.scale) === 'summative_tier'; })
        .map(stripRowMeta_)
        .sort(function (a, b) { return new Date(b.judgedAt) - new Date(a.judgedAt); }),
      readiness: readSheetObjects_(SHEETS.READINESS)
        .filter(function (r) { return normaliseEmail_(r.email) === target; })
        .map(stripRowMeta_),
      lessons: listLessons_(gradeKey).map(function (lesson) {
        const s = best[lesson.id];
        return {
          id: lesson.id, number: lesson.number, title: lesson.title,
          type: lesson.type, track: lesson.track || 'main', strand: lesson.strand || null,
          marksAvailable: worksheetTotal_(lesson),
          worksheetScore: s ? Number(s.percent) : null,
          marksAwarded: s ? Number(s.marksAwarded) : null,
          submittedAt: s ? s.submittedAt : null,
          attempts: submissions.filter(function (r) { return r.lessonId === lesson.id; }).length,
          results: s ? attachTeacherGuidance_(gradeKey, lesson.id, safeParse_(s.resultsJson, [])) : []
        };
      })
    };
  });
}

/**
 * Records a teacher's judgement of one strand.
 *
 * Append-only: a re-check after bridging supersedes the earlier row rather than
 * overwriting it, so the record shows the change. Nothing here derives a level —
 * the level arrives from the teacher.
 */
function api_recordJudgement(payload) {
  return handle_(function (user) {
    requireStaff_(user);
    payload = payload || {};

    const target = normaliseEmail_(payload.email);
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const strand = String(payload.strand || '').toUpperCase();
    if (CONFIG.STRANDS.indexOf(strand) === -1) throw new Error('INVALID_STRAND');

    const level = String(payload.level || '');
    if (CONFIG.SCALES.summative_tier.indexOf(level) === -1) throw new Error('INVALID_LEVEL');

    const gradeKey = 'grade' + (String(payload.grade || '6').replace(/[^0-9]/g, '') || '6');
    const track = payload.track === 'bridging' ? 'bridging' : 'main';
    const strandDef = getStrand_(gradeKey, strand);

    return withLock_(function () {
      // Supersede whatever currently stands for this strand and event.
      const id = Utilities.getUuid();
      const existing = judgementsFor_(target).filter(function (j) {
        return String(j.strand).toUpperCase() === strand &&
               String(j.scale) === 'summative_tier' &&
               String(j.assessmentEvent) === String(payload.assessmentEvent || 'final') &&
               !j.supersededBy;
      });
      existing.forEach(function (row) {
        const updated = stripRowMeta_(row);
        updated.supersededBy = id;
        updateRow_('JUDGEMENTS', row._rowIndex, updated);
      });

      appendRow_('JUDGEMENTS', {
        id: id,
        email: target,
        grade: gradeKey.replace('grade', ''),
        track: track,
        strand: strand,
        level: level,
        scale: 'summative_tier',
        assessmentEvent: String(payload.assessmentEvent || 'final'),
        frameworkRefs: strandDef ? strandDef.tiers[level === 'working_towards' ? 'emerging' : level].code : '',
        evidenceProducts: String(payload.evidenceProducts || ''),
        evidenceObservations: String(payload.evidenceObservations || ''),
        evidenceConversations: String(payload.evidenceConversations || ''),
        note: String(payload.note || ''),
        accessArrangements: String(payload.accessArrangements || ''),
        nextStep: String(payload.nextStep || ''),
        bridgingRef: String(payload.bridgingRef || ''),
        judgedBy: user.email,
        judgedAt: new Date(),
        supersededBy: ''
      });

      logAudit_(user.email, 'JUDGE', target + ' ' + strand + ' -> ' + level);
      return buildStrandProfile_(gradeKey, judgementsFor_(target));
    });
  });
}

/** Records a start-of-year diagnostic result for one strand. */
function api_recordReadiness(payload) {
  return handle_(function (user) {
    requireStaff_(user);
    payload = payload || {};
    const target = normaliseEmail_(payload.email);
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const strand = String(payload.strand || '').toUpperCase();
    if (CONFIG.STRANDS.indexOf(strand) === -1) throw new Error('INVALID_STRAND');

    const result = String(payload.result || '');
    if (CONFIG.SCALES.bridging_readiness.indexOf(result) === -1) throw new Error('INVALID_LEVEL');

    withLock_(function () {
      appendRow_('READINESS', {
        email: target,
        grade: String(payload.grade || '6'),
        strand: strand,
        probeCode: String(payload.probeCode || ''),
        result: result,
        action: String(payload.action || ''),
        recheckAfterWeek: String(payload.recheckAfterWeek || ''),
        recordedBy: user.email,
        recordedAt: new Date()
      });
    });

    logAudit_(user.email, 'READINESS', target + ' ' + strand + ' = ' + result);
    return { email: target, strand: strand, result: result };
  });
}

/**
 * The cohort as ADEK's observation record, field for field.
 *
 * This is the artefact that leaves the building, so it carries levels and notes
 * rather than scores, and names the decision rule that produced each overall.
 */
function api_exportCsv() {
  return handle_(function (user) {
    requireStaff_(user);
    const gradeKey = 'grade6';
    const roster = readSheetObjects_(SHEETS.ROSTER, true);
    const judgementsByEmail = groupBy_(readSheetObjects_(SHEETS.JUDGEMENTS), function (r) {
      return normaliseEmail_(r.email);
    });
    const strands = getStandardsIndex_(gradeKey);

    const header = ['Email', 'Name', 'Class'];
    CONFIG.STRANDS.forEach(function (s) {
      header.push((strands[s] ? strands[s].label : s), s + ' note');
    });
    header.push('Overall level', 'Decision rule', 'Access arrangements', 'Next step',
                'Judged by', 'Judged at');

    const rows = roster.map(function (entry) {
      const email = normaliseEmail_(entry.email);
      const profile = buildStrandProfile_(gradeKey, judgementsByEmail[email] || []);
      const row = [email, entry.displayName || '', entry.className || ''];

      CONFIG.STRANDS.forEach(function (code) {
        const s = profile.byStrand.filter(function (r) { return r.strand === code; })[0];
        row.push(s && s.judged ? s.levelLabel : '', s ? s.note : '');
      });

      const judged = profile.byStrand.filter(function (s) { return s.judged; });
      row.push(profile.overall.level ? profile.overall.label : 'Not yet complete');
      row.push(profile.overall.rule || '');
      row.push(judged.map(function (s) { return s.accessArrangements; }).filter(Boolean)[0] || '');
      row.push(judged.map(function (s) { return s.nextStep; }).filter(Boolean).join('; '));
      row.push(judged.map(function (s) { return s.judgedBy; }).filter(Boolean)[0] || '');
      row.push(judged.map(function (s) { return s.judgedAt; }).filter(Boolean)[0] || '');
      return row;
    });

    logAudit_(user.email, 'EXPORT_CSV', rows.length + ' students');
    return { csv: [header].concat(rows).map(toCsvLine_).join('\n') };
  });
}

/* ---------------------------------------------------------------------------
 * Admin endpoints
 * ------------------------------------------------------------------------- */

function api_getAdminData() {
  return handle_(function (user) {
    requireAdmin_(user);
    return {
      roster: readSheetObjects_(SHEETS.ROSTER).map(stripRowMeta_),
      staff: readSheetObjects_(SHEETS.STAFF).map(stripRowMeta_),
      spreadsheetUrl: getSpreadsheet_().getUrl(),
      audit: readSheetObjects_(SHEETS.AUDIT).slice(-100).reverse().map(stripRowMeta_)
    };
  });
}

/** Adds or updates roster entries from pasted text: one "email, name, class" per line. */
function api_importRoster(text) {
  return handle_(function (user) {
    requireAdmin_(user);
    const lines = String(text || '').split(/\r?\n/)
      .map(function (l) { return l.trim(); })
      .filter(Boolean);

    const existing = readSheetObjects_(SHEETS.ROSTER);
    const indexByEmail = {};
    existing.forEach(function (r) { indexByEmail[normaliseEmail_(r.email)] = r; });

    let added = 0, updated = 0;
    const rejected = [];

    withLock_(function () {
      lines.forEach(function (line) {
        const parts = line.split(/\s*,\s*/);
        const email = normaliseEmail_(parts[0]);

        if (!email || !isAllowedDomain_(email)) {
          rejected.push(line + '  — not an @' + CONFIG.ALLOWED_DOMAIN + ' address');
          return;
        }
        const previous = indexByEmail[email];
        const row = {
          email: email,
          displayName: parts[1] || deriveNameFromEmail_(email),
          grade: parts[3] || '6',
          className: parts[2] || '',
          active: true,
          // Preserve per-strand bridging routing across a re-import.
          bridgingStrands: previous ? (previous.bridgingStrands || '') : ''
        };

        if (previous) { updateRow_('ROSTER', previous._rowIndex, row); updated++; }
        else { appendRow_('ROSTER', row); added++; }
      });
    });

    logAudit_(user.email, 'IMPORT_ROSTER', added + ' added, ' + updated + ' updated');
    return { added: added, updated: updated, rejected: rejected };
  });
}

/** Grants or revokes a staff role. Admin only. */
function api_setStaffRole(email, role) {
  return handle_(function (user) {
    requireAdmin_(user);
    const target = normaliseEmail_(email);
    if (!isAllowedDomain_(target)) throw new Error('DOMAIN_NOT_ALLOWED');

    const valid = [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN];
    const newRole = String(role || '').toLowerCase().trim();
    if (valid.indexOf(newRole) === -1) throw new Error('INVALID_ROLE');

    withLock_(function () {
      const match = readSheetObjects_(SHEETS.STAFF).filter(function (r) {
        return normaliseEmail_(r.email) === target;
      })[0];

      const row = {
        email: target, role: newRole, displayName: deriveNameFromEmail_(target),
        addedAt: new Date(), addedBy: user.email
      };
      if (match) updateRow_('STAFF', match._rowIndex, row);
      else appendRow_('STAFF', row);
    });

    invalidateCache_(SHEETS.STAFF);
    logAudit_(user.email, 'SET_ROLE', target + ' -> ' + newRole);
    return { email: target, role: newRole };
  });
}

/* ---------------------------------------------------------------------------
 * Internal helpers
 * ------------------------------------------------------------------------- */

/**
 * Re-attaches the question prompt and the published look-for to marked results,
 * for staff viewing only.
 *
 * Neither is stored on the submission: the prompt would duplicate content that
 * already lives in the lesson, and the look-for is the teacher's guidance and must
 * never be served to a student. Both are read back from the authoritative lesson
 * at the moment a teacher opens the record.
 */
function attachTeacherGuidance_(gradeKey, lessonId, results) {
  let questions;
  try {
    questions = (getLessonAuthoritative_(gradeKey, lessonId).worksheet || {}).questions || [];
  } catch (err) {
    return results;   // lesson has since been removed; show the marks without guidance
  }
  const byId = {};
  questions.forEach(function (q) { byId[q.id] = q; });

  return results.map(function (result) {
    const question = byId[result.questionId];
    if (!question) return result;
    const enriched = {};
    Object.keys(result).forEach(function (k) { enriched[k] = result[k]; });
    enriched.prompt = question.prompt || '';
    if (result.needsTeacherReview) enriched.lookFor = question.lookFor || '';
    return enriched;
  });
}

function normaliseEmail_(value) {
  return String(value || '').toLowerCase().trim();
}

function gradeKeyFor_(user) {
  const grade = String(user.grade || '6').replace(/[^0-9]/g, '') || '6';
  const key = 'grade' + grade;
  return CURRICULUM[key] ? key : 'grade6';
}

function judgementsFor_(email) {
  const target = normaliseEmail_(email);
  return readSheetObjects_(SHEETS.JUDGEMENTS).filter(function (r) {
    return normaliseEmail_(r.email) === target;
  });
}

/** "CE,GE" -> ['CE','GE'] */
function parseStrandList_(value) {
  return String(value || '').split(/[,;\s]+/)
    .map(function (s) { return s.toUpperCase().trim(); })
    .filter(function (s) { return CONFIG.STRANDS.indexOf(s) !== -1; });
}

function worksheetTotal_(lesson) {
  const questions = (lesson.worksheet && lesson.worksheet.questions) || [];
  return questions.reduce(function (s, q) { return s + (Number(q.marks) || 0); }, 0);
}

function bestSubmissionsByLesson_(email) {
  const target = normaliseEmail_(email);
  return bestByLesson_(readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (r) {
    return normaliseEmail_(r.email) === target;
  }));
}

function bestByLesson_(rows) {
  const best = {};
  rows.forEach(function (row) {
    const id = row.lessonId;
    if (!best[id] || Number(row.percent) > Number(best[id].percent)) best[id] = row;
  });
  return best;
}

function countAttempts_(email, lessonId) {
  const target = normaliseEmail_(email);
  return readSheetObjects_(SHEETS.SUBMISSIONS).filter(function (r) {
    return normaliseEmail_(r.email) === target && r.lessonId === lessonId;
  }).length;
}

function markLessonStarted_(email, lesson) {
  const match = findProgressRow_(email, lesson.id);
  if (match) return; // already tracked; don't reset the start time
  appendRow_('PROGRESS', {
    email: normaliseEmail_(email), lessonId: lesson.id,
    track: lesson.track || 'main', weekNumber: lesson.week || '',
    status: 'in-progress', startedAt: new Date(), updatedAt: new Date(), submittedAt: ''
  });
}

function recordProgress_(email, lesson, status, submittedAt) {
  const match = findProgressRow_(email, lesson.id);
  const row = {
    email: normaliseEmail_(email), lessonId: lesson.id,
    track: lesson.track || 'main', weekNumber: lesson.week || '',
    status: status,
    startedAt: match ? match.startedAt : new Date(),
    updatedAt: new Date(),
    submittedAt: submittedAt || (match ? match.submittedAt : '')
  };
  if (match) updateRow_('PROGRESS', match._rowIndex, row);
  else appendRow_('PROGRESS', row);
}

function findProgressRow_(email, lessonId) {
  const target = normaliseEmail_(email);
  return readSheetObjects_(SHEETS.PROGRESS).filter(function (r) {
    return normaliseEmail_(r.email) === target && r.lessonId === lessonId;
  })[0] || null;
}

function groupBy_(rows, keyFn) {
  const out = {};
  rows.forEach(function (row) {
    const key = keyFn(row);
    if (!out[key]) out[key] = [];
    out[key].push(row);
  });
  return out;
}

function valuesOf_(obj) {
  return Object.keys(obj).map(function (k) { return obj[k]; });
}

function distinct_(arr) {
  return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
}

function latestDate_(rows) {
  let latest = null;
  rows.forEach(function (r) {
    const d = r.submittedAt ? new Date(r.submittedAt) : null;
    if (d && !isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
  });
  return latest;
}

function safeParse_(json, fallback) {
  try { return JSON.parse(json); } catch (err) { return fallback; }
}

function stripRowMeta_(row) {
  const copy = {};
  Object.keys(row).forEach(function (k) { if (k !== '_rowIndex') copy[k] = row[k]; });
  return copy;
}

function toCsvLine_(values) {
  return values.map(function (v) {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',');
}

/* ==========================================================================
 * Code.gs
 * ========================================================================== */

/**
 * Web app entry point.
 *
 * Google enforces the domain restriction before this runs (access: DOMAIN in
 * appsscript.json), but we re-check here so that a misconfigured deployment
 * fails closed with an explanation rather than silently serving the app to
 * someone it should not.
 */

function doGet() {
  let user = null;
  try {
    user = getCurrentUser();
  } catch (err) {
    return renderAccessDenied_(err && err.message);
  }

  ensureSchema_();

  const template = HtmlService.createTemplateFromFile('ui/Index');
  template.bootstrapUser = JSON.stringify(user);
  template.appName = CONFIG.APP_NAME;

  return template.evaluate()
    .setTitle(CONFIG.APP_NAME + ' — ' + CONFIG.SCHOOL_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Lets one HTML file pull in another — how Apps Script does partials. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Standalone page shown when the caller is not a valid AISA account. */
function renderAccessDenied_(code) {
  const message = code === 'DOMAIN_NOT_ALLOWED'
    ? 'This platform is only for AISA accounts. Please sign out and sign in again with your <strong>@' +
      CONFIG.ALLOWED_DOMAIN + '</strong> account.'
    : 'We could not confirm your Google sign-in. Close this tab, then open the link again.';

  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">' +
    '<style>' +
    'body{font-family:"DM Sans",sans-serif;background:#fff;color:#1A1A1A;margin:0;' +
    'display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1.5rem}' +
    '.card{max-width:32rem;border:1px solid #C8BEE8;border-left:4px solid #D8B664;' +
    'border-radius:8px;padding:2rem}' +
    'h1{color:#21076C;font-size:1.5rem;margin:0 0 .75rem}' +
    'p{line-height:1.6;color:#555;margin:0}' +
    '</style></head><body><div class="card">' +
    '<h1>Sign-in required</h1><p>' + message + '</p>' +
    '</div></body></html>'
  ).setTitle('Sign-in required');
}

/**
 * One-time setup, run from the Apps Script editor by the deploying admin.
 * Creates the datastore workbook and reports where it lives.
 */
function setup() {
  const ss = ensureSchema_(getSpreadsheet_());
  const url = ss.getUrl();
  console.log('Datastore ready: ' + url);
  console.log('Keep this spreadsheet private — it holds every student mark.');
  return url;
}
