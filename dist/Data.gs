/**
 * StudyTwin — Data.gs
 *
 * GENERATED FILE. Every section below is one file from src/ in the repository.
 * Do not edit this in the Apps Script editor: regenerate with `npm run bundle`
 * and paste it again, or the next rebuild will silently discard your change.
 *
 * Built: 2026-09-17T14:47:08.798Z
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
 * Built: 2026-09-17T14:47:08.755Z
 */

const CURRICULUM = {"grade6":{"meta":{"grade":6,"title":"Grade 6 — Artificial Intelligence","subtitle":"ADEK AI Curriculum","provisional":true,"note":"Structure and content are placeholders pending the official ADEK Grade 6 curriculum document. Standards codes, lesson titles and worksheet content must be replaced with the published versions before this is used for reporting."},"units":[{"id":"g6-u1","title":"Understanding Artificial Intelligence","summary":"What AI is, where students already meet it, and how machines learn from data rather than from rules.","lessons":["g6-l01","g6-l02"]}],"lessons":{"g6-l01":{"id":"g6-l01","number":1,"type":"core","title":"What is Artificial Intelligence?","summary":"Meet the difference between a machine that follows rules and a machine that learns.","duration":"45 minutes","objectives":["Define **artificial intelligence** in your own words","Explain how AI is different from an ordinary computer program","Identify at least three examples of AI you already use","Describe what is meant by [[narrow AI]] and [[general AI]]"],"sections":[{"type":"text","heading":"Machines that follow rules","body":["Every computer program is a set of instructions. A calculator adds two numbers because a programmer wrote the rule for adding. A traffic light changes colour because someone wrote the rule for when to change. The machine never decides anything — it follows what it was told, exactly, every single time.","This works brilliantly when the rules are easy to write down. But some problems are almost impossible to write rules for. Try writing the rules for recognising your friend's face. Where do you start? Eye colour? Distance between the eyes? What if they smile, or wear a hat, or stand in the shade?"]},{"type":"text","heading":"Machines that learn","body":["**Artificial intelligence** is what we call it when a machine does something that would normally need human thinking — recognising a face, understanding a sentence, spotting a pattern.","Most modern AI does not work from rules a person wrote. Instead it is shown thousands of examples and finds the patterns by itself. Show a system enough photographs labelled *cat* and *not a cat*, and it works out what makes a cat a cat. Nobody ever writes down the rule. This is called [[machine learning]]."]},{"type":"vocabulary","heading":"Key vocabulary","terms":[{"term":"Artificial Intelligence (AI)","definition":"A computer system that performs tasks normally needing human intelligence."},{"term":"Machine Learning","definition":"A way of building AI by learning patterns from examples instead of following written rules."},{"term":"Training data","definition":"The examples an AI system learns from."},{"term":"Narrow AI","definition":"AI that is very good at one specific task and cannot do anything else."},{"term":"General AI","definition":"A hypothetical AI that could learn any task a human can. It does not exist yet."}]},{"type":"callout","label":"Important","body":["Every AI system that exists today is **narrow AI**. A system that plays chess at world-champion level cannot tell you the weather. A system that recognises faces cannot play chess. General AI — a machine that could do anything a person can — is still science fiction."]},{"type":"list","heading":"AI you already use","items":["**Voice assistants** — turning the sound of your voice into words, then into an action","**Map apps** — predicting which route will be fastest using live traffic patterns","**Video and music apps** — recommending what you might like based on what you watched before","**Camera apps** — finding faces in the frame so the picture stays in focus","**Spam filters** — learning which emails are junk from millions of examples","**Translation apps** — converting one language to another from patterns in translated text"]},{"type":"activity","label":"Class activity","heading":"Rule or pattern?","body":["Work with a partner. For each task below, decide whether a programmer could reasonably write the rules, or whether the machine would need to learn from examples."],"items":["Working out change from a 50 dirham note","Deciding whether a photograph contains a camel","Sorting a list of names into alphabetical order","Telling whether a film review is positive or negative","Checking whether a password is at least eight characters long"]}],"worksheet":{"title":"Lesson 1 worksheet","questions":[{"id":"l01q1","type":"mcq","marks":2,"prompt":"Which of these best describes artificial intelligence?","options":[{"id":"a","text":"Any computer program that runs quickly"},{"id":"b","text":"A computer system that performs tasks normally requiring human intelligence"},{"id":"c","text":"A robot with arms and legs"},{"id":"d","text":"A website that stores a lot of information"}],"answer":"b","feedback":{"correct":"Exactly — it is about the kind of task, not the kind of machine.","incorrect":"AI is defined by what the system does, not by how fast it is or what it looks like."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"E","code":"AIF·CU·G6·E"}],"tierProbed":"emerging","evidenceType":"product"},{"id":"l01q2","type":"truefalse","marks":1,"prompt":"General AI — a machine that can learn any task a human can — already exists today.","answer":false,"feedback":{"correct":"Correct. Every AI system today is narrow AI.","incorrect":"Not quite. General AI does not exist yet; everything today is narrow AI."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"E","code":"AIF·CU·G6·E"}],"tierProbed":"emerging","evidenceType":"product"},{"id":"l01q3","type":"multi","marks":3,"prompt":"Select **all** of the everyday tools below that use artificial intelligence.","options":[{"id":"a","text":"A voice assistant that responds when you speak to it"},{"id":"b","text":"A calculator app adding two numbers"},{"id":"c","text":"A video app recommending what to watch next"},{"id":"d","text":"A spam filter deciding which emails are junk"},{"id":"e","text":"A digital clock displaying the time"}],"answer":["a","c","d"],"feedback":{"correct":"Well spotted — all three learn from patterns rather than following fixed rules.","partial":"Some right. Remember: a calculator and a clock follow rules a programmer wrote.","incorrect":"Look for tools that learn from examples rather than following a fixed rule."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"E","code":"AIF·CU·G6·E"}],"tierProbed":"emerging","evidenceType":"product"},{"id":"l01q4","type":"matching","marks":4,"prompt":"Match each AI system to the kind of data it learns from.","left":[{"id":"l1","text":"Face recognition in a camera"},{"id":"l2","text":"A translation app"},{"id":"l3","text":"A spam filter"},{"id":"l4","text":"A music recommendation system"}],"right":[{"id":"r1","text":"Thousands of labelled photographs"},{"id":"r2","text":"Sentences already translated by people"},{"id":"r3","text":"Emails marked as junk or not junk"},{"id":"r4","text":"What millions of listeners played before"}],"answer":{"l1":"r1","l2":"r2","l3":"r3","l4":"r4"},"feedback":{"correct":"Every AI system learns from examples of the thing it needs to do.","partial":"Some correct. Ask yourself what examples each system would need to see."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"E","code":"AIF·CU·G6·E"},{"framework":"AIF","strand":"CU","grade":6,"tier":"P","code":"AIF·CU·G6·P"}],"tierProbed":"proficient","evidenceType":"product"},{"id":"l01q5","type":"fillBlank","marks":2,"prompt":"Complete the sentence: Machine learning systems find patterns in ______ instead of following ______ written by a programmer.","blanks":["first blank","second blank"],"answer":[["data","examples","training data"],["rules","instructions","a rule"]],"feedback":{"correct":"That is the key difference in one sentence.","partial":"One of the two is right — reread the section on machines that learn."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"P","code":"AIF·CU·G6·P"}],"tierProbed":"proficient","evidenceType":"product"},{"id":"l01q6","type":"shortText","marks":3,"prompt":"Explain in your own words why it is easier to teach a computer to recognise a cat by showing it examples than by writing rules.","placeholder":"Write two or three sentences…","maxLength":600,"keywordsAny":["pattern","example","learn","rule","hard to describe","too many","different","vary"],"keywordsNeeded":2,"modelAnswer":"Cats look different from each other and appear in different positions, colours and lighting, so it would take an enormous number of rules to describe every possible cat. Showing the system many labelled examples lets it find the patterns itself.","hint":"Think about how many different ways a cat can appear in a photograph.","feedback":{"correct":"Good explanation.","partial":"You are on the right track — try to mention both the examples and why rules are hard.","incorrect":"Reread 'Machines that follow rules'. Think about why a face or a cat is hard to describe in rules."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"E","code":"AIF·CU·G6·E"},{"framework":"AIF","strand":"CU","grade":6,"tier":"P","code":"AIF·CU·G6·P"}],"tierProbed":"proficient","evidenceType":"product"}]},"strands":["CU"],"track":"main","provisional":true},"g6-l02":{"id":"g6-l02","number":2,"type":"lab","provisional":true,"title":"Lab: Train your own image classifier","summary":"Build a working machine learning model in the browser, then find out what happens when the training data is poor.","duration":"60 minutes","objectives":["Train a machine learning model using your own examples","Describe the stages of a [[machine learning workflow]]","Measure how accurate a model is","Explain how **biased training data** produces unfair results"],"sections":[{"type":"callout","label":"Before you start","body":["You will need a device with a webcam and an internet connection. Nothing you make in this lab is uploaded or saved to anyone else's computer — the model trains inside your browser and disappears when you close the tab."]},{"type":"text","heading":"What you are building","body":["You are going to teach a computer to tell two things apart — for example, a pen and a rubber, or your hand showing a thumbs up and a thumbs down. You will not write a single rule. You will only show it examples.","This is exactly how the image recognition in a phone camera is built, just much smaller."]},{"type":"steps","heading":"Part 1 — Train a model","items":["Open **Teachable Machine** in your browser and choose **Image Project**, then **Standard image model**.","Rename **Class 1** to the name of your first object, for example *Pen*.","Click **Webcam** and hold the object in front of the camera. Hold the record button for about ten seconds, moving the object around as you go. You should collect roughly 100 images.","Rename **Class 2** to your second object, for example *Rubber*, and record about 100 images the same way.","Click **Train Model**. Do not switch tabs while it trains.","When training finishes, hold each object up to the webcam and watch the confidence bars move."]},{"type":"activity","label":"Record your results","heading":"Part 2 — Test it properly","body":["Testing a model on the same images you trained it with tells you nothing. You have to test it on things it has never seen.","Show each object to the camera **ten times**, in different positions and different lighting. Count how many times the model gets it right out of the twenty tests in total."],"items":["Test your first object ten times. Write down how many were correct.","Test your second object ten times. Write down how many were correct.","Add the two numbers together to get your score out of 20."]},{"type":"steps","heading":"Part 3 — Break it on purpose","items":["Start a **new** Image Project.","Train it again with the same two objects — but this time record all of your examples in one position only, without moving the object at all.","Use only about 20 images per class instead of 100.","Train the model, then test it by holding the objects at completely different angles.","Notice how much worse it performs. The model has not become less clever. It has simply never seen anything like what you are now showing it."]},{"type":"callout","label":"The big idea","body":["A machine learning model can only recognise what its **training data** taught it. If the examples are few, or all the same, or only show one kind of thing, the model will fail on everything else.","This is where [[bias]] comes from. A face recognition system trained mostly on one group of people works badly for everyone else — not because anyone intended that, but because of what it was shown."]}],"worksheet":{"title":"Lab 2 worksheet","questions":[{"id":"l02q1","type":"ordering","marks":4,"prompt":"Put the stages of a machine learning project into the correct order.","items":[{"id":"s1","text":"Collect examples for each class"},{"id":"s2","text":"Train the model on the examples"},{"id":"s3","text":"Test the model on new things it has not seen"},{"id":"s4","text":"Improve the training data and train again"}],"answer":["s1","s2","s3","s4"],"feedback":{"correct":"That is the loop every machine learning project goes round.","partial":"Close. Remember you cannot test before you have trained."},"frameworkRefs":[{"framework":"AIF","strand":"SD","grade":6,"tier":"P","code":"AIF·SD·G6·P"}],"tierProbed":"proficient","evidenceType":"product"},{"id":"l02q2","type":"numeric","marks":2,"prompt":"A model was tested 20 times and got 17 correct. What is its accuracy as a percentage?","answer":85,"tolerance":0.5,"placeholder":"Percentage","hint":"Divide the number correct by the number of tests, then multiply by 100.","feedback":{"correct":"17 out of 20 is 85%.","incorrect":"17 ÷ 20 = 0.85, and 0.85 × 100 = 85%."},"frameworkRefs":[{"framework":"AIF","strand":"CE","grade":6,"tier":"P","code":"AIF·CE·G6·P"}],"tierProbed":"proficient","evidenceType":"product"},{"id":"l02q3","type":"mcq","marks":2,"prompt":"Why must you test a model on images it has never seen before?","options":[{"id":"a","text":"Because testing on training images only shows it can remember, not that it can recognise"},{"id":"b","text":"Because the training images get deleted after training"},{"id":"c","text":"Because new images train the model further"},{"id":"d","text":"Because it makes the model run faster"}],"answer":"a","feedback":{"correct":"Right — a model that only works on what it has already seen is useless.","incorrect":"Think about the difference between remembering an answer and understanding it."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"A","code":"AIF·CU·G6·A"}],"tierProbed":"advanced","evidenceType":"product"},{"id":"l02q4","type":"multi","marks":3,"prompt":"In Part 3 you trained a deliberately weak model. Select **all** the reasons it performed badly.","options":[{"id":"a","text":"There were far fewer training images"},{"id":"b","text":"Every image was taken from the same position"},{"id":"c","text":"The computer was running too slowly"},{"id":"d","text":"The model had never seen the objects at other angles"},{"id":"e","text":"The objects themselves had changed"}],"answer":["a","b","d"],"feedback":{"correct":"All three are problems with the training data, not the model.","partial":"Some right. The model and the computer were identical both times — only the data changed."},"frameworkRefs":[{"framework":"AIF","strand":"CU","grade":6,"tier":"A","code":"AIF·CU·G6·A"},{"framework":"AIF","strand":"GE","grade":6,"tier":"A","code":"AIF·GE·G6·A"}],"tierProbed":"advanced","evidenceType":"product"},{"id":"l02q5","type":"shortText","marks":4,"prompt":"A company builds a face recognition system and trains it almost entirely on photographs of adults. Explain what problem this is likely to cause, and how the company could fix it.","placeholder":"Write three or four sentences…","maxLength":800,"keywordsAny":["children","child","young","bias","biased","unfair","fail","worse","more data","varied","diverse","range","different people"],"keywordsNeeded":3,"modelAnswer":"The system would work poorly on children's faces, because it has never been shown examples of them. That is unfair to anyone the training data left out, and it could mean children are not recognised or are misidentified. The company should fix it by collecting a much more varied set of training photographs covering people of all ages, and then testing the system separately on each group to check it works for everyone.","hint":"Who is missing from the training data, and what happens to them?","feedback":{"correct":"Good — you identified who is affected and what would fix it.","partial":"You have part of it. Make sure you say who is affected *and* what the company should do.","incorrect":"Reread 'The big idea'. Think about who is missing from the training data."},"frameworkRefs":[{"framework":"AIF","strand":"GE","grade":6,"tier":"A","code":"AIF·GE·G6·A"}],"tierProbed":"advanced","evidenceType":"product"},{"id":"l02q6","type":"shortText","autoMarked":false,"prompt":"Exit ticket: which single data flaw would you fix first to improve the output the most, and why?","stem":"The flaw I would fix first is ___ because ___.","lookFor":"Names one specific flaw from their own investigation log and links it to a change in the output, rather than giving a general statement about data quality.","frameworkRefs":[{"framework":"AIF","strand":"CE","grade":6,"tier":"E","code":"AIF·CE·G6·E"}],"evidenceType":"product","tierProbed":"emerging"}]},"strands":["CU","SD","GE","CE"],"track":"main"}}}};

/** Official ADEK framework catalogue — strand descriptors per grade per tier. */
const FRAMEWORK = {"source":"ADEK AI Literacy Curriculum — Scope & Sequence, KG to Grade 12, Term 1","framework":"ADEK K–12 AI Fluency Framework","extractedFrom":"curriculum/source/ADEK_Scope_and_Sequence_Term1.html","tiers":[{"key":"emerging","label":"Emerging","letter":"E","ordinal":1},{"key":"proficient","label":"Proficient","letter":"P","ordinal":2},{"key":"advanced","label":"Advanced","letter":"A","ordinal":3}],"strandRows":[{"row":"Knowing how intelligent systems learn and operate","theme":"How AI works"},{"row":"Working with data, and designing solutions","theme":"Data & design"},{"row":"Exercising judgement in the use of AI systems","theme":"Judgement"},{"row":"Assessing AI systems for ethical use","theme":"Ethics & governance"}],"grades":{"grade4":{"CU":{"code":"CU","label":"AI Conceptual Understanding","theme":"How AI works","frameworkRow":"Knowing how intelligent systems learn and operate","tiers":{"emerging":{"code":"AIF·CU·G4·E","descriptor":"Recognises that systems use data to make decisions."},"proficient":{"code":"AIF·CU·G4·P","descriptor":"Explains how data is represented and used."},"advanced":{"code":"AIF·CU·G4·A","descriptor":"Explains how patterns in data influence outcomes."}}},"DA":{"code":"DA","label":"Data Awareness","theme":"Data & design","frameworkRow":"Working with data, and designing solutions","tiers":{"emerging":{"code":"AIF·DA·G4·E","descriptor":"Labels and organises simple data."},"proficient":{"code":"AIF·DA·G4·P","descriptor":"Identifies errors or imbalance in data."},"advanced":{"code":"AIF·DA·G4·A","descriptor":"Improves data to make it more accurate and balanced."}}},"CE":{"code":"CE","label":"Critical Evaluation & Informed Interaction","theme":"Judgement","frameworkRow":"Exercising judgement in the use of AI systems","tiers":{"emerging":{"code":"AIF·CE·G4·E","descriptor":"Uses block-based tools to simulate decisions."},"proficient":{"code":"AIF·CE·G4·P","descriptor":"Creates simple solutions using data and logic."},"advanced":{"code":"AIF·CE·G4·A","descriptor":"Explains how data influences the outcome of a solution."}}},"GE":{"code":"GE","label":"Responsible AI Use","theme":"Ethics & governance","frameworkRow":"Assessing AI systems for ethical use","tiers":{"emerging":{"code":"AIF·GE·G4·E","descriptor":"Recognises that data can affect fairness."},"proficient":{"code":"AIF·GE·G4·P","descriptor":"Explains how biased data leads to unfair outcomes."},"advanced":{"code":"AIF·GE·G4·A","descriptor":"Evaluates fairness based on input data."}}}},"grade5":{"CU":{"code":"CU","label":"AI Conceptual Understanding","theme":"How AI works","frameworkRow":"Knowing how intelligent systems learn and operate","tiers":{"emerging":{"code":"AIF·CU·G5·E","descriptor":"Recognises that AI systems generate outputs using data."},"proficient":{"code":"AIF·CU·G5·P","descriptor":"Explains how AI uses data to generate responses."},"advanced":{"code":"AIF·CU·G5·A","descriptor":"Explains how data quality affects AI outputs."}}},"DA":{"code":"DA","label":"Data Literacy","theme":"Data & design","frameworkRow":"Working with data, and designing solutions","tiers":{"emerging":{"code":"AIF·DA·G5·E","descriptor":"Recognises that data affects outputs."},"proficient":{"code":"AIF·DA·G5·P","descriptor":"Identifies when data is incomplete or biased."},"advanced":{"code":"AIF·DA·G5·A","descriptor":"Suggests improvements to make data more reliable."}}},"SD":{"code":"SD","label":"AI Solution Design & Development","theme":"Judgement","frameworkRow":"Exercising judgement in the use of AI systems","tiers":{"emerging":{"code":"AIF·SD·G5·E","descriptor":"Uses AI tools to generate simple outputs with guidance."},"proficient":{"code":"AIF·SD·G5·P","descriptor":"Uses structured prompts to generate useful outputs."},"advanced":{"code":"AIF·SD·G5·A","descriptor":"Refines prompts to improve output quality and explains why."}}},"GE":{"code":"GE","label":"Ethics & Responsible Use","theme":"Ethics & governance","frameworkRow":"Assessing AI systems for ethical use","tiers":{"emerging":{"code":"AIF·GE·G5·E","descriptor":"Recognises when outputs may be incorrect."},"proficient":{"code":"AIF·GE·G5·P","descriptor":"Evaluates outputs for accuracy and fairness."},"advanced":{"code":"AIF·GE·G5·A","descriptor":"Explains misinformation risks and proposes verification strategies."}}}},"grade6":{"CU":{"code":"CU","label":"AI Conceptual Understanding","theme":"How AI works","frameworkRow":"Knowing how intelligent systems learn and operate","tiers":{"emerging":{"code":"AIF·CU·G6·E","descriptor":"Recognises the difference between rule-based and learning systems."},"proficient":{"code":"AIF·CU·G6·P","descriptor":"Explains how AI systems learn from data to generate outputs."},"advanced":{"code":"AIF·CU·G6·A","descriptor":"Explains how training data affects output quality and performance."}}},"SD":{"code":"SD","label":"AI Solution Design & Development","theme":"Data & design","frameworkRow":"Working with data, and designing solutions","tiers":{"emerging":{"code":"AIF·SD·G6·E","descriptor":"Uses AI tools with structured prompts to complete tasks."},"proficient":{"code":"AIF·SD·G6·P","descriptor":"Applies simple structured processes (input to output) to generate results."},"advanced":{"code":"AIF·SD·G6·A","descriptor":"Builds structured AI-assisted solutions using guided inputs and data."}}},"CE":{"code":"CE","label":"Critical Evaluation & Informed Interaction","theme":"Judgement","frameworkRow":"Exercising judgement in the use of AI systems","tiers":{"emerging":{"code":"AIF·CE·G6·E","descriptor":"Identifies when outputs are incorrect or unclear."},"proficient":{"code":"AIF·CE·G6·P","descriptor":"Evaluates outputs for accuracy and relevance."},"advanced":{"code":"AIF·CE·G6·A","descriptor":"Explains how changes to inputs or data improve outputs."}}},"GE":{"code":"GE","label":"Ethics & Governance","theme":"Ethics & governance","frameworkRow":"Assessing AI systems for ethical use","tiers":{"emerging":{"code":"AIF·GE·G6·E","descriptor":"Recognises basic risks (e.g. incorrect outputs, unsafe use)."},"proficient":{"code":"AIF·GE·G6·P","descriptor":"Explains bias, privacy, and the need for responsible use."},"advanced":{"code":"AIF·GE·G6·A","descriptor":"Identifies biased outputs and suggests simple ways to improve fairness and safety."}}}}}};

/** Published week-by-week Main Course and Bridging sequences. */
const SEQUENCES = {"grade6":{"main":[{"week":"1 Launch","weekNumber":1,"phase":"Launch","lessons":[{"kind":"core","title":"Rule-Based vs Learning Systems"},{"kind":"lab","title":"Rule vs Learning: Hands-On Exploration"}],"strand":"All four strands","secures":"Unit launch. Students meet the unit’s big idea through a concrete comparison and establish the safe-use charter, drawing on all four Grade 6 strands in a first guided task.","stretch":"Students state the big idea in their own words and predict which strand each part of the task will need."},{"week":"2","weekNumber":2,"phase":null,"lessons":[{"kind":"core","title":"Rules vs Learning: How Each System Works"},{"kind":"lab","title":"Train a Simple Model"}],"strand":"AI Conceptual Understanding","secures":"Recognises the difference between rule-based and learning systems.","stretch":"Explains how AI systems learn from data to generate outputs."},{"week":"3","weekNumber":3,"phase":null,"lessons":[{"kind":"core","title":"Structured Prompts to Complete a Task"},{"kind":"lab","title":"Prompt-to-Task Workshop"}],"strand":"AI Solution Design & Development","secures":"Uses AI tools with structured prompts to complete tasks.","stretch":"Applies simple structured processes (input to output) to generate results."},{"week":"4","weekNumber":4,"phase":null,"lessons":[{"kind":"core","title":"Judging Outputs: Correct, Incorrect, Unclear"},{"kind":"lab","title":"Output Triage Clinic"}],"strand":"Critical Evaluation & Informed Interaction","secures":"Identifies when outputs are incorrect or unclear.","stretch":"Evaluates outputs for accuracy and relevance."},{"week":"5","weekNumber":5,"phase":null,"lessons":[{"kind":"core","title":"Risks and Responsible Use"},{"kind":"lab","title":"Class AI Risk Audit"}],"strand":"Ethics & Governance","secures":"Recognises basic risks (e.g. incorrect outputs, unsafe use).","stretch":"Explains bias, privacy, and the need for responsible use."},{"week":"6 Integrate","weekNumber":6,"phase":"Integrate","lessons":[{"kind":"core","title":"Bringing the Strands Together"},{"kind":"lab","title":"Integrated Build-and-Check"}],"strand":"All four strands","secures":"Applies all four Grade 6 strands to one task, so the strands become a single practice rather than four separate lessons.","stretch":"Students sequence the four strands independently and justify why each step is needed."},{"week":"7 Plan","weekNumber":7,"phase":"Plan","lessons":[{"kind":"core","title":"Signature Solution: Planning"},{"kind":"lab","title":"Prototype and Pressure-Test the Plan"}],"strand":"All four strands","secures":"Signature activity – planning. Students design a solution of their own that will require all four Grade 6 strands, and set the criteria it must meet.","stretch":"Students justify design choices against their criteria before any building begins."},{"week":"8 Build","weekNumber":8,"phase":"Build","lessons":[{"kind":"core","title":"Signature Solution: Building"},{"kind":"lab","title":"Extended Build and Evaluation"}],"strand":"All four strands","secures":"Signature activity – building. Students construct their planned solution, testing as they go and recording what changes and why.","stretch":"Students diagnose what is not working from evidence rather than by trial and error."},{"week":"9 Refine","weekNumber":9,"phase":"Refine","lessons":[{"kind":"core","title":"Signature Solution: Refining & Finishing"},{"kind":"lab","title":"Final Iteration and Risk Review"}],"strand":"All four strands","secures":"Signature activity – refining and finishing. Students improve the solution against the criteria and prepare to defend the decisions behind it.","stretch":"Students explain the impact of each refinement using the evidence they gathered."},{"week":"10 Showcase","weekNumber":10,"phase":"Showcase","lessons":[{"kind":"core","title":"Showcase, Assessment & Reflection"},{"kind":"lab","title":"Showcase Carousel and Reflection"}],"strand":"All four strands","secures":"Showcase, assessment and reflection. Students present the work, peer-review it against the criteria, and are assessed across all four strands.","stretch":"Students identify their own next target from the strand profile the rubric produces."}],"bridging":[{"week":"1","weekNumber":1,"phase":null,"lessons":[{"kind":"core","title":"Data Quality and AI Outputs"},{"kind":"lab","title":"Data Quality Investigation"}],"strand":"AI Conceptual Understanding","rebuildsTo":"Explains how data quality affects AI outputs.","frameworkRefs":["AIF·CU·G5·A"]},{"week":"2","weekNumber":2,"phase":null,"lessons":[{"kind":"core","title":"Refining Prompts for Better Outputs"},{"kind":"lab","title":"Prompt Refinement Workshop"}],"strand":"AI Solution Design & Development","rebuildsTo":"Refines prompts to improve output quality and explains why.","frameworkRefs":["AIF·SD·G5·A"]},{"week":"3","weekNumber":3,"phase":null,"lessons":[{"kind":"core","title":"How Data Shapes a Solution’s Outcome"},{"kind":"lab","title":"Trace-the-Data Investigation"}],"strand":"Critical Evaluation & Informed Interaction","rebuildsTo":"Explains how data influences the outcome of a solution.","frameworkRefs":["AIF·CE·G4·A"]},{"week":"4","weekNumber":4,"phase":null,"lessons":[{"kind":"core","title":"Misinformation Risks and Verification"},{"kind":"lab","title":"Verify and De-risk Workshop"}],"strand":"Ethics & Governance","rebuildsTo":"Explains misinformation risks and proposes verification strategies.","frameworkRefs":["AIF·GE·G5·A"]},{"week":"5 Integrate 1","weekNumber":5,"phase":"Integrate 1","lessons":[{"kind":"core","title":"Trustworthy AI Helper: Design & Test the Data (Part 1)"},{"kind":"lab","title":"Trustworthy AI Helper: Build & Refine the Prompt (Part 1)"}],"strand":"Integration – all four strands","rebuildsTo":"Integration, part 1. Students design and build a small solution that applies four rebuilt prior-grade strands at once.","frameworkRefs":["AIF·CU·G5·A","AIF·SD·G5·A","AIF·CE·G4·A","AIF·GE·G5·A"]},{"week":"6 Integrate 2","weekNumber":6,"phase":"Integrate 2","lessons":[{"kind":"core","title":"Trustworthy AI Helper: Trace the Data & Plan Checks (Part 2)"},{"kind":"lab","title":"Trustworthy AI Helper: Verify, De-risk & Showcase (Part 2)"}],"strand":"Integration – all four strands","rebuildsTo":"Integration, part 2. Students evaluate the solution against their criteria, justify each change with evidence and present it – meeting the prior-grade Advanced bar independently within the integrated task.","frameworkRefs":["AIF·CU·G5·A","AIF·SD·G5·A","AIF·CE·G4·A","AIF·GE·G5·A"]}]}};

// --- END OF Data.gs --- if you cannot see this line, the paste was cut short.
