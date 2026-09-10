# Changelog

All notable changes to Cairn are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **A pay range in another currency was read as yours.** Cairn took the currency from a
  symbol in front of the figures and assumed dollars when it found none, so
  `$155,000—$220,000 CAD` and `155,000—220,000 CAD` were both recorded as US dollars.
  Pay is one of the screens that can drop a lead outright, so the misreading decided
  whether a role reached you at all — and 220,000 Canadian is well under a 170,000
  dollar floor. A currency named after the range now beats a symbol before it, and a
  range that names no currency at all is compared with nothing rather than with yours.
  The refusal to compare across currencies was already written and correct; it could
  never fire, because the currency had been decided wrongly one step earlier.
- **Taking a lead threw away everything the screens had just read.** The posting came
  across and the reading of it did not — the band with the sentence it was read out of,
  where the work is done, and all nine verdicts. A role that arrived through Cairn's own
  front door showed no pay at all, so the pay filter was blind to exactly the roles
  Cairn had found for you. The posting is the evidence; the reading is the work.
- **Question six held one employer as two.** *Do we already have something live here?*
  matched the company name exactly, while the exclusion screen in the same app has
  always read *Hollis Health* and *Hollis Health, Inc.* as one company. It uses that
  reading now. It also says when an employer has already turned you down, which is the
  fourth thing the question asks and the one nothing could answer: a refusal is filed
  away, and filed-away rows were left out of the lookup entirely.
- **Three doors, two rules for a duplicate.** A spreadsheet import matched a repeat on
  the link *and* on the employer and title; a fetch and a role added by hand matched the
  link alone, so a filled requisition re-listed under a new link came back as new. One
  rule now, and its employer half collapses spellings the way the exclusion screen does.
- **The clearance note said the opposite of what it meant.** It read *"a clearance you
  already hold"* about a posting demanding one you must already hold.

### Added

- **Anything on a list can be done to a screenful at once.** Pipeline, Leads,
  Applications and Preflight each carry a tick against every row and one on the bar that
  takes the page. Once something is ticked, a row of controls appears saying what it is
  pointed at — **the rows you picked, this page, or everything the tab holds after its
  filters, each with its own count** — and nothing runs until that set has been named
  and counted back to you. Setting aside asks for the reason once and writes it on all
  of them, which is the whole value of the record.
- **Two moves are deliberately not offered in bulk.** Sending records a date, starts the
  clock on the silence and asks who a nudge goes to; reaching the last stage asks what
  actually happened. A question asked of forty rows at once is a question nobody
  answers, so those two stages are missing from the list on purpose.
- **What a batch of applications is actually for.** Follow-ups arrive in batches because
  applications go out in them, and the two things a batch decides — how each one travels
  and which are not worth chasing — were one row at a time. Setting a channel to
  *none-found* across a page and clearing the dates behind it is now one pass.
- **Leads you have set aside are paged like everything else**, and can be brought back
  together. That list drew the newest hundred and said so, which is a cap rather than a
  page: there was no way to reach the hundred and first.
- **Three screens the queue asks for and Cairn did not run.** Whether there is any way
  to apply at all — no link, no named employer, and the route question cannot be run.
  Whether the work needs a nationality rather than a skill, reported against what your
  profile says rather than decided for you. And which rung the title names, including
  when it names none.
- **A company that places people at other companies is named as one**, from the company
  field rather than only from phrasing buried in the prose.
- **The form, box by box.** Question five is the one that cannot be answered in a
  sentence, and it had a single line. A gate now carries one entry per box on the apply
  form — what it is called, whether it is required, and what goes in it — and a required
  box with nothing in it holds the gate at part-answered however many questions are
  ticked. Observing a field is not answering it: a gate recording *"there is a culture
  question"* reads as done because the description is accurate.
- **A box the employer asked you to answer in your own words is marked as one**, and
  nothing drafts prose for it. What comes back is facts and angles to write from.
- **Two states the answers could never add up to.** *Cannot be run* is a role with no
  route to apply — there is nothing to start, which is a different thing from nobody
  having started, and both used to read the same. *Sent before Cairn* is an application
  that went out before there was a gate to run.
- **Preflight keeps the record apart from the work.** Importing a pipeline means every
  application in it predates the gate, so a page built to be empty opened with a finding
  against all of them — and a check that always has something on it stops being read.
  One press moves them to their own tab and out of the count; answering the gate on one
  brings it back.
- **Sending asks who a nudge goes to.** It is the one step of the follow-up that belongs
  in the same sitting as the application: a posting names its poster and a taken-down
  posting names nobody. A role that already has a channel is not asked twice.
- **An interview is where a contact comes from.** Every application confirmation arrives
  from a no-reply address; the people in the room arrive with the invitation and go when
  it is archived. The interview page asks for them now.

### Changed

- **The paid runners left routine CI.** A macOS minute is billed at ten and a Windows
  minute at two, and the cross-platform matrix ran on every push and every dependabot
  pull request — twelve of those were open at once. Linux still checks and tests every
  push and every pull request; macOS and Windows run on the release tag, which builds and
  tests all three, and by hand before a tag when a change touches the native side. A break
  there fails the release rather than reaching anybody.
- **Dependabot opens fewer pull requests**, grouped by ecosystem rather than one per
  package. Each one used to start its own three-platform build.

## [1.2.0] - 2026-09-09

### Added

- **Narrow a list to the roles you want to look at.** Pipeline, Applications and Leads
  each carry two controls above their tabs: where a role sits against the pay you set,
  and which of your skills its posting names — including **the ones that name none of
  them**. The tabs are counted after, so a tab never says a number the list under it does
  not have, and the bar says how many are hidden.
- **On Leads it reaches both halves.** A lead you set aside is still a lead, so one lens
  covers the queue and the pile. A posting arrives as HTML and the gate screened the text
  of it, so that is what a skill is looked for in — matched raw, a word inside a tag or a
  class name would count as a mention.
- **The filter and the gate read a role the same way.** Both call one function, so the
  band on a list can never disagree with the pay verdict on the role. Two arithmetics for
  one question eventually part, and the screen that disagrees is the one nobody trusts.
- **An empty list says which kind of empty it is.** *Nothing waiting — turn on a source
  and fetch* is true of an empty queue and false of one a filter emptied, and the second
  reads as the fetch having failed.
- **A control with nothing behind it says what to set.** No pay floor, or no skills
  listed, and the control is replaced by the sentence that fixes it rather than by a
  picker that decides nothing. A skill you later take off your profile stops reading as
  set, instead of hiding nothing while claiming to hide something.

### Changed

- **A Preflight row is the control.** Open sat in a third of the width of the thing you
  were aiming at, and the row it belonged to did nothing — so the target was the button
  rather than the finding. The row opens the role now, with a chevron to say so, and it
  takes a keyboard the way the button did.
- **A check stopped saying what its own tab already said.** *No gate — Gate not-run* is
  the check named twice, and on the check's own tab the reason was the tab title repeated
  down every row. A gate that is part-answered still says so, because that is the one
  thing the title does not carry.
- **Leads leads with the employer**, as every other list here does. Four postings from
  one company read as four companies while the name was the faint line under the title.
- **A card on the pipeline's *All* tab says which stage it is in.** Every other tab is
  the answer; on that one the only readable clue was which stage the button named.
- **The rail and the Applications screen say which number is which.** The rail counts
  what is still open and the first tab counts everything ever sent — both right, one
  word carrying them, and nothing saying they differ.
- **One date format.** `9/7/2026` is two dates in two countries and it was on the screen
  with the most of them.
- **The tick that separates answered from described has a word beside it**, and the
  colour on the word *Gate* now says in words which state it means.
- **The interface stopped explaining itself.** A line under a control saying what the
  control already says is not teaching, it is noise — and six identical ones down the gate
  panel were worse than none. Twenty of them are gone, and the ones that stayed carry a
  consequence, a constraint or the meaning of a word: *Compact fits about three more rows
  on screen*, *Stores a hash of the link only*, *There is no undo*. A label with nothing
  to add now renders as a label rather than as a label and a blank line.

## [1.1.0] - 2026-09-09

### Added
- **Sending asks about the gate.** The board turned the one move the whole procedure
  stands in front of into a single drag, and Preflight only said so afterwards. It asks
  now — run the gate, or send it anyway — because an application sent without one is a
  real thing and refusing would be worse than recording it.
- **Preflight is one check at a time**, tabbed and paged like every other list here.


- **An All tab on the pipeline.** Every stage tab is a filter, and until now the only
  thing that showed everything again was the board.


- **Reaching the last stage asks what happened.** Offered, turned down, not the fit and
  withdrawn all landed in one column, and a month later the row could not say which —
  dragging a card there recorded a stage and called it an outcome. It asks at the moment
  of the move, which is the only moment anybody knows, and *not decided yet* is one of
  the answers so the question is not a trap.


- **A role carries its posting, and pressing it reads the job.** A row with a company, a
  title and a band tells you nothing about the work. Taking a lead keeps what the
  posting said, so it survives the requisition filling and the link going dead — which
  is the one thing you cannot look up afterwards. Roles added by hand take a pasted one
  under **Edit**, and opening the posting in a browser is a press inside the reading
  panel rather than instead of it.
- **Any scheduled interview can be prepared for**, not only the next one. Two in a week
  meant one of them had a panel and the other had a line.
- **Leads are paged**, both the ones whose title matches and the ones that do not.
- **Applications carries its count in the rail** — sent and still open, which is what
  the screen leads with.


- **The pipeline as a board.** Five columns, one per stage, and a card you drag from one
  to the next — the columns are somewhere a role can *go*, which is what separates a
  board from a grid. Dragging is not the only way in: every card carries the next stage
  as a press. Reaching Applied still records the date and starts the clock on the
  silence, wherever the move is made from. A column draws twenty and says how many more
  it is holding, because a board is for the shape of the whole thing rather than for
  reading three thousand cards.


- **Today is a worklist rather than a summary.** It showed three of fifty-three things
  due, sorted by date, which put a nudge, a half-finished gate and something ready to
  send next to each other as though they were the same job. They are five piles now —
  **due today**, **overdue**, **ready to send**, **gate half-finished**, **silent too
  long** — each saying why it is its own pile, and a pile with nothing in it is not
  drawn.
- **Preflight reaches the front page.** A screen you have to remember to open is the
  failure it exists to prevent, so when it has something Today says what and how many.
  When it is clean the line is not there at all.
- **Two headline counts that do not contain each other.** *Live opportunities* and
  *Applications sent* overlapped and neither said what to do. **Waiting on you** is your
  work; **waiting on them** is not. Beside them, the reply rate and the **typical
  reply** — the middle one rather than the mean, because two employers answering after
  four months would drag an average somewhere useless.
- **Today says which day it is**, and the next interview carries its date rather than
  a weekday and a time.


- **A stage is paged, and you choose how big a page is.** Ten, twenty, fifty or a
  hundred from a select beside Next, kept between sessions, with a bar saying which of
  how many rather than that there are more. Changing the size keeps the first role you
  were looking at on screen, so it does not also move you somewhere else in the list.
- **The pipeline reads as a list or as a grid** — one button that says what pressing it
  does, because the two are one choice. Also in **Settings → The app**.
- **Applications is split by where each one got to** — waiting, heard back, ended — and
  paged the same way. One list of a hundred and fifty was three different kinds of work
  in a single scroll, and the silence only means something on the first of them.
- **Checks is called Preflight**, after the pass a printer or a pilot makes before
  something irreversible leaves.


- **The gate.** The six questions asked before an application goes out, on every role,
  with the state they add up to. A question can be answered or merely described, and the
  difference is the point: a gate that records *"there is a culture question"* and never
  drafts an answer reads as done because it is accurate. Every question settled is
  **run**; any of them touched and not settled is **partial**.
- **Question six answers itself.** *Do we already have something live at this employer?*
  is the only one of the six that asks about us rather than the posting, and Cairn holds
  every application already. Opening the gate says what else is out at that employer and
  when it went — matched however the name is capitalised.
- **Blocker, concession, contact and follow-up channel.** One named thing outstanding on
  an otherwise-clear gate; a gap that had to be named on a form with nowhere to name it;
  who a nudge goes to and how it travels. Each was a separate property because no
  existing field could carry the meaning without lying about another.
- **Checks** — four things the procedures cannot catch on their own: sent without a
  completed gate, sent with an undelivered concession, a gate reading clear while the
  application is blocked, and a follow-up date with no channel. **It is empty when
  nothing is out of step, and that is what makes it worth opening.**



- **Cairn speaks Spanish, French and Portuguese**, and can speak anything else somebody writes a catalogue for.
  **Settings → The app → Language.** A catalogue is a file of phrases keyed by the English
  phrase itself, so nothing invents a name for a sentence and **a phrase with no
  translation shows the English it was written in** — never a key and never a blank. That
  makes a language useful before it is finished.
- **The whole interface, from one place.** Every string reaches the screen through one
  helper, so translation happens there and **648 call sites needed no change at all**.
  Only the attributes somebody reads go through it — a class or a data key would be
  renamed and the stylesheet would break.
- **A language of your own.** Drop `es.json`, `fr.json` or anything else into `lang/` in
  your vault and it appears in the picker. Yours is laid over the shipped one, so
  correcting a single line is a whole change rather than a copy of the catalogue.
- **The lock screen follows the machine.** The setting lives in the vault, so the first
  screen anybody sees had none to read and was English whatever they had chosen. It now
  takes the language the operating system reports, falling back from `pt-BR` to `pt`
  rather than to English. Nothing is stored outside the vault to make that work.
- **The phrase list ships**, at `defaults/lang/phrases.json`, so a translator has the
  source rather than having to find the strings themselves. `npm run phrases` rebuilds
  it, and a check fails when the interface has phrases the list does not — or when a
  translation drops one of a shape's values, or invents one it was never given.
- **A sentence built around a number is translated too.** `3 roles, newest first.` is a
  different string every time it is shown, so there is nothing to look up. The catalogue
  carries the shape — `{0} roles, newest first.` — and the values go back in after the
  lookup, **in whatever order the language needs them**. A plural is two shapes rather
  than one, so no sentence reads as French around an English word.
- **Coverage is measured and stated, not implied.** The panel says what percentage of the
  855 phrases a catalogue carries, and how many sentences could not be written as a
  phrase at all. **That count is zero**, and it is printed rather than assumed: reporting
  100% while sentences stayed English would be the kind of figure that stops anybody
  reading.

- **An assistant you bring yourself.** Cairn ships no model, no key and no service behind
  it. Bring a key from Anthropic, OpenAI, Gemini, Mistral or a model running on your own
  machine, and four jobs become possible that no rule can do: **reading a posting** for
  the band written in prose and the office clause three paragraphs down, **drafting a
  letter**, **suggesting an answer** for a question in the bank, and **looking an
  employer up**. It decides nothing. Whether a role fits, which family it belongs to and
  whether the location works are still yours, with the evidence on screen.
- **Everything it would send is shown first, in full.** The address, the model, the size,
  the whole system prompt and every message — never summarised, never folded away. **Send
  it** or **Not now**. The request is built in the main process and held there; the
  interface is handed a ticket rather than a payload, so what goes is exactly what was
  shown, and a ticket is spent once. Turning off the prompt for one task is a switch per
  task, and the request still appears afterwards with everything the panel would have
  shown, so the review is late rather than absent.
- **A quote that is not in the posting is thrown away, and said out loud.** Every fact a
  reading returns carries the sentence it came from, and the sentence has to be in the
  posting or the fact is dropped. The band then comes from Cairn's own parser reading
  that sentence rather than from a figure the model typed, so the figure on the card is
  read by the same code as every other one.
- **A research note is sourced whole or refused whole.** Every sentence has to name a
  source the provider returned. Half sourced is the harder one to read, because nothing
  marks which half. Only a provider that can search and cite is offered it at all, and
  where none can the button is absent rather than disabled.
- **A draft arrives with its checkable sentences listed beside it.** No machine can tell a
  true claim about somebody from a plausible one, so Cairn lists the sentences carrying a
  figure or a year and stops. Saving still runs the guard that has always decided whether
  a letter may render.
- **Every request goes through the gate a job board goes through.** The gate learned to
  send a body; the one-call-site rule is unchanged and still enforced by the build. An
  assistant request is counted in the bar along the bottom and listed in **What has left
  this machine**, and appears a second time as a question in **Vault & privacy → What I
  asked the assistant** with the host, the model and the token counts.
- **A key is locked twice.** Sealed by the operating system's own keychain before the
  ciphertext is written into the encrypted vault, so Cairn holds neither lock. On Linux
  the `basic_text` backend is **refused rather than used** — it is a fixed phrase standing
  in for a keychain, and calling that a lock would be the worst thing Cairn could do here.
  A key never crosses to the interface; the panel shows three characters and dots.
- **A model on your own machine may be reached over plain http**, and it is the only thing
  that may. `localhost` and `127.0.0.1` are the exception because there is no network
  between the two ends; a hostname that merely contains the word is refused like any other.
  **Vault & privacy says so in words** when that is what you are using, rather than leaving
  it to be noticed in a settings field.

- **Your own word for each stage**, in **Settings → My search**. Rename any of the five
  and it changes the pipeline headings, the Move buttons and the one line of prose that
  named one; leave it blank for Cairn's. A stage can also borrow another's colour, from
  the five in the palette rather than a free one, so a renamed pipeline still looks like
  the rest of the app. **The set of five stays**, and that is the point rather than the
  shortfall: three of them do something rather than say something — reaching Applied is
  what records the date and starts the clock on the silence, Interviewing is what the
  rail and Today count, and Decision is where nothing moves on from. Reordering them or
  adding one means deciding where those go, which is a different piece of work.

- **Set a role aside, with the reason.** A role you decided against before applying had
  no way out of the pipeline at all — archiving only happened as a side effect of
  recording a rejection, which needs an application first. Everything set aside is under
  **Pipeline → Set aside**, newest first, carrying why, and can be put back.
- **Change a role.** Fit, the next action, its date and the notes are editable on the row.
  `fit` is the one thing every screen deliberately leaves to a person, and there had been
  nowhere to put it.


- **A day on the calendar says which role it is.** An entry for something due carried the
  action as its label and hid the employer in the tooltip, so a Monday of five deadlines
  read as five lines of "Held to Monday" with nothing to tell them apart. It is now
  `employer · role`, the way an interview and a sent application were already labelled,
  and the action is what you get on hover.
- **A packaged Cairn had no crash fallback.** Skipping the graphics card after a crash,
  `--crashes` and `--try-graphics` all lived in the launcher script, which only exists in
  a checkout — so everybody who installed the `.deb`, the `.rpm`, the AppImage, the `.dmg`
  or the Windows build had none of it. The app does it itself now, reading and writing the
  same marker file the launcher uses so the two can never disagree on one machine. A
  graphics process told to stop is not a crash, or a normal quit would put every machine
  on the slow path forever.
- **A question you opened and did not answer vanished.** Pressing **Write one** created an
  entry with nothing in it, which the written list filtered out and the worth-answering
  list counted as held — so it appeared in neither, and the screen said you had written
  something for every question when you had written none. They have their own section now.

### Fixed
- **A lead as a card had its header collapse on top of itself.** A lead is already a
  card — a title, where it came from, what the screens settled, and two answers — and
  its header is a row built for the full width. In a grid the header stacks, and the
  column is narrow enough that two fit the reading measure; one column would only have
  been the list again.
- **Opening a finding from Preflight lands on the role, not on the board.** The board
  draws five cards a column, so the one you asked for was usually not on it — and a
  board is a place you choose to be rather than somewhere to be dropped. The drawing
  changes for that jump; the choice does not.


- **Every list remembers its own shape.** Leads, applications and preflight wrote the
  pipeline's setting, so choosing the board there quietly put all three back to a list —
  the toggle worked and then something else undid it. They share one setting of their
  own, in **Settings → The app** beside the pipeline's.
- **One line at the left of the paging bar, not two.** The figures sat beside the count
  as a second run of words at a second type size, in the same corner. They ride inside
  the count now: *1–20 of 150 · 39% answered*, *1–20 of 132 out of step*.


- **Leads, Applications and Preflight are the same kind of screen as the pipeline.** It
  taught what a list here is — tabs carrying counts, an **All** to get back out of a
  filter, a bar with the figures on the left and the paging on the right, a page size,
  and a choice of shape — and each of the other three honoured a different half of it.
  A screen that can do a thing beside a sibling that cannot reads as the app taking
  something away.
- **The board stays the pipeline's alone**, and the other three refuse it. A column on a
  board is somewhere a card can *go*, and nothing on those screens is a destination.


- **An application is a row, in the same shape as a role.** It was a table, and a table
  needs a header to say what its columns are — which is how three of them came to be one
  word repeated down the page under a heading explaining it. A row says what it is as it
  goes: *Sent 9/7/2026*, *They replied*, *2 days quiet*.
- **Preflight's checks are named rather than described.** *No gate*, *Concession owed*,
  *Blocked*, *No channel* — the long form is what the check is called in the procedure
  it came from, and this screen is not the place to recite it.


- **Every screen stopped explaining itself.** A sentence under the title on every screen,
  forever, telling somebody looking at a list of leads that these are leads nobody has
  judged yet. The interface teaches that by being used.
- **The calendar's months move on the same two arrows** as every other list.


- **The applications table had five columns and three of them said the same thing on
  every row.** *Résumé: not recorded* twenty times, *Where it got to: Sent* on every row
  of Waiting, and twenty identical buttons — so the eye crossed two dead columns to
  reach the number that decides anything. The employer leads the row now, a column is
  drawn only where it varies, and which résumé went is kept beside the dates it belongs
  to rather than repeated down the page.
- **The figures, the count and the paging are one line about one table.** They were
  three bands floating above a fourth.


- **The paging bar stopped saying what it was standing on.** "1–20 of 57 roles" on a
  list of roles and "Page 1 of 3" on a paging bar: both said twice. It reads
  `1–20 of 57` and `1 / 3`.
- **Previous and next are a direction, drawn.** Four letters spelling *Previous* is a
  wide control for a small move, and it needed translating three times to say the same
  arrow.
- **The count sits at the left of the bar and the controls at the right.** With nothing
  to its left the whole bar was shoved against the right edge, which is what made the
  applications table read as unrelated to the bar above it.
- **Pressing a role closes the posting it opened.** A control that only opens needs a
  second one to undo it, and that was a Close button doing what the row could already do.
- **The posting link is a link**, not a button that happens to open one.
- **The figures sit beside the table they describe**, rather than against the heading.


- **Adding a role by hand is folded.** The rarest thing on the screen was taking the
  room at the foot of every one of them.
- **The board's shape control is the same control as everywhere else.** It was built
  separately and kept its words while the rest became an icon.
- **Applications had four figures where two of them were the tab counts said again, and
  said differently** — *Heard back 58* beside a tab reading *Heard back 17*, because one
  counted the applications that had already ended and the other did not. Two figures
  now, on one line, above the tabs they no longer contradict.


- **The shape control is the shape you are in**, drawn rather than written. A button
  saying what it will do next is a label you have to read to find out where you are.
- **The page-size select says 10, not 10 per page.** It sits on a paging bar.


- **Today folds.** Five piles open at once was the wall the page was meant to replace.
  Each is one line saying how much of that kind of work there is, and the most pressing
  one opens.


- **Every date was a day early.** A date is stored as `2026-08-11` and was read with
  `new Date()`, which is UTC midnight — the 10th anywhere west of Greenwich. So the
  calendar drew every deadline and every application a day before it happened, and
  "Overdue by 12 days" meant eleven. A stored calendar day is now read as a calendar
  day; anything carrying a time is still a moment, because an interview is one.
- **The calendar clipped four days a week.** `repeat(7, 1fr)` will not shrink a column
  below its content, so seven tracks grew to their longest entry — 2,447 pixels of grid
  in an 896-pixel box, with `overflow: hidden` and no scrollbar to reach the rest.
  Thursday to Sunday were simply gone. The chips already had an ellipsis that could
  never fire.
- **A day belonging to another month now looks like one.** A month always draws six
  weeks, so August opens with five days of July; they were tinted and nothing else.
- **Nothing on the calendar could be clicked.** Every entry names a role, and pressing
  one goes to that role.
- **Going to a role took you to a screen.** A row on Today, a search hit and a calendar
  entry all landed at the top of a pipeline fourteen screens long, leaving you to do
  the search the click was for. They scroll to the role and mark it.
- **The stage heading scrolled away and nothing said where you were.** It sticks, with
  its count.
- **A pipeline row is built to be scanned.** The employer leads, the band is aligned and
  comparable, and the next action — the same sentence on a dozen rows — is quiet. It was
  the other way round, so the boldest thing on every row was the part that repeated.
- **Today showed three things and hid fifty.** It says how many are waiting and how many
  need you now, and opens the pipeline.
- **A past interview was described as overdue.** An interview is not a deadline; the
  diary separates what is still to come from what already happened.
- **A weekday inside the week carries its date.** "Friday" alone left you asking which one.
- **The Answer bank put the unusable panel first**, and said so in its own subtitle.

### Changed

- **The pipeline is one stage at a time.** Every stage at once was one long page: at
  35,700 roles it was 158,941 elements, 1.1 million pixels of scroll and five seconds
  before anything appeared. Stages are tabs carrying their counts, and what has been set
  aside is one of them.
- **Long lists are drawn a screenful at a time**, with a button saying how many are
  left rather than how many there are. The applications table drew all 19,678 rows.
- **A calendar day shows four and counts the rest.** A cell grew to fit everything on
  it, which made one month forty thousand pixels tall.
- **Cairn ships no price table, on purpose.** What a model costs changes without notice,
  and a figure quietly a year old is worse than none. The panel shows the size of what is
  about to go and links to the provider's own pricing page.
- **The official client library was tried and not taken.** Injecting the gate's own fetch
  into it does work — retries included, with a poisoned global fetch never touched. It was
  still not taken: Cairn's loudest claim is that one function makes every request, and
  routing through a library makes that claim depend on the library rather than on code the
  build can check. Both protocols are raw requests through the one gate.

## [1.0.0] - 2026-09-08

### Added

- **A file you add can be linked instead of copied**, in **Settings → The app → My
  files**. Copying stays the default because it is the only one that keeps: a linked
  file is **not encrypted, not in an export, and gone the moment you move it**, and the
  document row says so. Changing the setting decides what happens to the next file, not
  to anything already held. A linked file that has gone says exactly that rather than
  failing silently.
- **The vault can live somewhere else.** **Vault & privacy → Your vault** says where it
  is and moves it — an encrypted disk, a folder that is backed up. It is **copied,
  counted, and only then removed**, with Cairn pointed at the new place last: every way
  a move can fail leaves the vault where it was and Cairn still looking there. A rename
  would be quicker and cannot cross a disk, which is most of the reason anybody moves
  one.
- **One notice a day about what is due**, in **Settings → The app → Alerts**. Off
  until you ask for it. Interviews today, anything due and anything past due, in one
  notification — five separate ones about a job search is a channel people turn off, and
  the real one goes with it. **Quiet hours** default to 22:00–08:00 and wrap past
  midnight properly, because that is what people set. It reads your vault and nothing
  else: nothing is scheduled on a server and nothing leaves the machine to make it
  happen, and a locked vault says nothing at all.
- **Find anything, with `Ctrl+K`** — `⌘K` on a Mac. Roles, leads, answers, documents
  and interviews, searched where they live. Two words narrow rather than widen: a
  result has to match all of them, because matching any is the noise you were narrowing
  away from. A hit quotes the sentence it was found in, unless that only repeats the
  row. **Nothing is indexed**, so there is nothing to rebuild and nothing to go stale —
  a vault holds thousands of rows rather than millions, and an index for that is a
  second copy to keep true.
- **A résumé can be replaced, and the file it replaced is kept.** **Replace** on a
  document points the record at a newer file; the old one stays where it is under its
  own name, listed with the date it was replaced and a way to open it. **An application
  records the file that went, not just the document**, so replacing a résumé cannot
  change the answer to what somebody already read — the ledger says *an earlier
  version* when the two have parted. Which one they got is the first thing an
  interviewer asks about, and it used to stop being answerable the moment you tailored
  your résumé.
- **Check for a newer Cairn**, in **Settings → The app**. It looks when you press the
  button and never on its own: one request to the release page, through the same gate
  as everything else, so it is counted and listed in **What has left this machine**. It
  downloads nothing and installs nothing — a new version is something you fetch and run
  yourself, which is also the only honest arrangement for a build nobody signed. A tag
  it cannot read is not an update: saying nothing beats telling you to upgrade because
  a release was named something unexpected.
- **Erase everything.** The one thing in Cairn with no way back, so it asks you to type
  the words rather than hit a button: *erase everything*, then a confirmation naming
  what goes. It takes your vault, every vault **Start over** set aside, Cairn's own log
  and its crash dumps — a dump holds memory from the moment a process died, and an open
  vault is in that memory, so leaving those would make the word untrue. What you have
  written out to a file is not touched, and neither is any backup you keep elsewhere.
  What remains on the disk is encrypted and the salt its key came from is gone with the
  rest.
- **Ctrl and a number moves between views**, ⌘ on a Mac. The rail carries seven
  Workspace views and four in Library, and `Ctrl+1` to `Ctrl+9` reach the first nine.
  The two left over are the two nobody moves between constantly: **Vault & privacy is
  `Ctrl+0`**, and **Settings is `Ctrl+,`** — the shortcut every application already
  uses for it, rather than a leftover number. Every rail button says which key reaches
  it.
- **Mask for sharing.** Every employer becomes `•••••` and every figure `•••`, so the
  app can go on a screen share without the search going with it. The role stays, which
  is the part worth showing. The switch is in the rail beside **Lock vault** because it
  gets pressed after a call has already started, and again in **Settings → The app**
  for whoever goes looking. It is remembered in the vault rather than the window, so a
  lock does not quietly unmask a screen somebody is still sharing.

- **A board family turned on with no employers says so in the row you turned it on
  in**, and offers the way out. It only said so on the Harvest tab, which is not where
  anybody is standing when they flip a switch.
- **Cairn knows some employer boards to start from.** Eleven, across all four board
  families, on **Sources → Employers**. **None of them is being watched** — adding one
  is what records it, and the list is identical for everybody until you change it. It
  exists because turning on a board family and having nothing to poll is a dead end
  with no way out of it from that screen. While you follow none, the list leads the
  Employers screen rather than sitting under two panels you have no use for yet.
- **Cairn builds for Linux, macOS and Windows.** An AppImage, `.deb`, `.rpm` and
  tarball for Linux on both architectures; a `.dmg` and `.zip` for Apple silicon and
  Intel; an installer and a portable `.exe` for Windows. **None of them is signed**, and
  `docs/installing.md` says which file to take and what each operating system will say
  about that.
- **A release is built once on each operating system, and CI builds on all of them.**
  The Rust key module and the database binding are compiled against the host and
  neither cross-builds, so one runner producing four platforms would ship three that
  cannot open a vault.
- **Cairn builds a distributable.** An AppImage and a `.deb`, from `make package`. It
  had no packaging configuration at all, so `make package` and the release workflow's
  packaging step would both have failed the first time anybody ran them.
- **A vault Cairn cannot read says so before you type.** The lock screen names the
  reason, gives the steps, and offers to set the old vault aside — rather than asking
  for a passphrase it already knows will not work. **Vault & privacy → Your vault**
  prints the format your vault was written in beside the newest this build reads.
- **`docs/upgrading.md`**, carrying every change that asks something of you. A test
  fails when the vault format moves and no section explains it, so the guide cannot
  fall behind the code.
- **Any table saves as a CSV.** Every column and every row, not the seven on screen and
  not the page you are looking at — a file holding what somebody happened to be looking
  at is wrong six weeks later.
- **A spreadsheet of roles reads in.** The CSV you kept before Cairn: it needs a company
  column and a role column, and reads a link, a location and notes when they are there.
  It knows the headings people actually type — Employer, Job Title, Link, City. A file
  with neither company nor role is refused whole rather than half-read, a role already
  tracked is left alone, and a column nothing was read out of is named rather than
  dropped in silence.
- **Eight job sources, and a harvest that uses them.** Greenhouse, Lever, Ashby and
  SmartRecruiters read an employer's own board; Remotive, Arbeitnow, Jobicy and
  Remote OK read republished listings and are labelled as such on every figure they
  carry. All eight arrive switched off.
- **Feeds and job families are edited in the app.** Both used to mean opening a file
  in the source tree, which is not editing so much as forking. **Write a feed** asks
  for an address and what the fields are called; **Make it mine** opens a shipped feed
  in the same form. Your version is saved beside the original rather than over it, so
  removing yours brings the shipped one back — and a feed written in the app goes
  through the same reader that judges a file somebody sent you, so there is one
  standard rather than two.
- **The job families are editable too**, in Settings, with **Use only my families** to
  drop the shipped sample once your own list is the one you use.
- **A listing site is a file, not a release.** Where to fetch and what the fields are
  called is all one is, so it lives in a source pack you can copy, edit and import.
  The four that ship are in `defaults/sources.json`; yours live in your vault and are
  never in this repository. The format has nowhere to put a key, cannot switch a feed
  on, and cannot take over a feed already there — importing a pack never causes a
  request, and the Sources screen names the host a feed would reach before you turn
  it on.
- **A pay range from a listing site is read only when the site says the employer
  published it.** Its own estimate is dropped rather than shown smaller: an estimate
  that ranks a role is a number nobody said, and these have been out by tens of
  thousands at the ceiling.
- **A feed with no search parameter is fetched once a run**, not once per job title.
  It hands back the same list every time, and several requests for one answer is not
  something an app that counts what it sends gets to do quietly.
- **The job families you search are yours.** The shipped list is a sample; `families.json`
  in your vault replaces the ones you redefine, or all of them with
  `"replaceShipped": true`.
- **Adding an employer is pasting a link.** Cairn reads the board out of any job URL
  on a careers page, so nobody has to know what an applicant tracking system is.
- **Requisitions**, where a harvest puts what survives. Each lead carries its band and
  where the band came from, every screen that needs reading with the sentence it was
  read from, the settled checks collapsed, and the four questions Cairn will not
  answer printed as questions.
- **A run that survives its own failures.** One board answering 503 does not stop the
  others, and a source whose response shape has changed is reported by name rather
  than read as an employer with no openings.
- **The answer bank.** Write an answer once and Cairn offers it the next time a form
  asks the same thing. Matching works on meaning first and wording second: *Desired
  salary* and *What are you looking for in pay?* share no words and find each other,
  while *are you authorised to work here* and *do you need sponsorship* share several
  and stay apart — answering one with the other is a wrong Yes or No.
- **Paste a form and see what Cairn can answer.** It reads the labels out of a pasted
  application page and says which of your answers each field is asking for, with the
  reason attached. It fills nothing in and sends nothing.
- **A reuse count on every answer**, moved when an answer is used rather than when it
  is written. It is the one figure that says whether the bank is earning its keep.

- **Letters.** Three skeletons, filled with what Cairn knows and left open where the
  writing is yours. A slot nothing filled stays visible rather than quietly emptying,
  because a blank space where a company name should be is only obvious to somebody
  who already knows it should be there.
- **A guard on every letter, and it fails closed.** Unfilled placeholders in any of
  their forms, markup that survived extraction, and the tells of something that wrote
  it for you — *here is your cover letter*, *I hope this helps*, *as an AI*. Every
  refusal quotes the words that caused it, and all of them are reported at once rather
  than one round at a time.
- **A rendered letter is read back before it is kept.** Every silent failure of
  headless printing produces a valid PDF with nothing on the page, and all of them
  exit successfully. Cairn counts the text drawn against the length of the letter and
  refuses to leave a file that came out empty.

- **A way to run it.** `make install` puts a `cairn` command on your PATH with a
  desktop entry and icon, so the app starts from a launcher rather than a build
  command. `cairn --rebuild` builds again after a pull; `make uninstall` removes the
  launcher and never touches the vault.
- **Applications.** A ledger of what you sent, when, and what came back, with the
  column that matters last: how long a role has been silent. Marking one sent is an
  event rather than a field edit — it records the date, starts the clock, and sets the
  reminder to chase.
- **A timeline on every application.** A reply, an interview or an ending moves the
  role on its own, because leaving somebody to remember to also drag it is how a
  pipeline stops describing anything.

- **Interviews**, which open on the next one rather than a list of them. *What am I
  preparing for* has one answer. Who you are meeting with your own notes, the
  questions you meant to ask, and a checklist that strikes items through rather than
  removing them, so it still reads as what you decided to do.
- **A calendar.** Interviews, deadlines, next actions and the days you applied, on one
  grid. It reads a single list of dated things rather than each table separately, so a
  new kind of dated thing appears there without the calendar learning about it.
- **Scheduling an interview moves the role and records it.** Two places to update by
  hand is one place that will be forgotten.

- **The posting itself.** Every description was kept from the moment it was fetched
  and none of it was shown, so keep-or-drop was decided on the screens alone. It is
  folded under the verdicts, one click opens it, and the original is a button away in
  your own browser. The markup is stripped before it reaches the interface.
- **A run says what it did, and keeps saying it.** *Read 51 postings, kept 0* is
  indistinguishable from *did not run* unless it says which screen removed them. The
  summary is kept in the vault, so the answer survives closing the window.
- **A crash log.** Electron knows which of its processes went and why, and Cairn
  writes it down. `cairn --crashes` prints it; nothing is uploaded.

### Changed

- **The words on screen are the ones people use.** **Requisitions** are **Leads** —
  which is what every other line in the app already called them. A **harvest** is
  **fetching**, and the button says **Fetch now**. What belongs to you is named as
  yours: **My vault**, **My data**, **My files**, **My answers**, **My name**, **Where
  I am**, **Employers I follow**, **Employers I never want to see**. *Being told* is
  **Alerts**. *Where your data lives* is **Where my vault is**. *Out of the vault, and
  back in* is **Export and import**. A form still asks in the second person, because
  that is a question being put to you; a label for your own things does not.
- **One paragraph was no longer true.** The employers screen still said no employer
  list ever ships, which stopped being true the day Cairn started carrying eleven.

- **The theme is one file, and it ships with the app.** `defaults/theme/cairn.json`
  carries every colour, size and space Cairn uses. Change a value, run `make theme`,
  and it reaches the whole interface — nothing in a component stylesheet is a literal.
  It sits with the rest of the shipped defaults rather than in a design folder, because
  it is Cairn's theme rather than a specification of one, and anybody who wants a
  different one has all of it.
- **Electron 32 to 44, and electron-builder 25 to 26.** Nineteen high advisories and
  twenty-four medium ones, all of them in what the build uses rather than what ships.
  Electron 44 is the first line that stops depending on `extract-zip`, whose symlink
  traversal has no published fix — every release between 39 and 41 still carries it.
  The database binding moves with it, from 11 to 13.
- **A vault written before this cannot be opened after it.** The database library's
  encrypted file format changed, and no version of it both reads the old format and
  builds against a current Electron — the V8 change that forced the rewrite is the
  rewrite that changed the format. **The lock screen says so before you type**, gives
  you the steps and a way to set the old vault aside, and never asks for a passphrase
  it knows will not work. The steps are in `docs/upgrading.md`.
- **The specification's one contradiction is settled by removal.** Update checks
  called themselves *the only request the app makes on a schedule* while harvesting
  polled every three hours. Nothing checks on a schedule, so nothing can contradict
  anything.
- **Node 22.12 is the floor.** Electron's own tooling requires it, and Node 20 is past
  its supported life.
- **Comments say what the code does, in one sentence.** The reasoning behind a
  decision is in the commit that made it.
- **The title no longer decides.** It was a hard screen, and it threw away 48 of every
  51 postings before anybody saw them — including the ones with a title nobody would
  have thought to search for. Only the rules you set yourself can drop a lead now: an
  employer you excluded, one already in your list, pay under your floor, a posting
  older than your limit. The titles you named come first and the rest are a click
  away.
- **Requisitions are rows you can scan.** The role, who it is with, the band and where
  it came from, and a count of what is worth reading against what is already clear.
  Keep and Not for me stay on the row, and the detail is built the first time a row
  is opened.

### Fixed

- **An excluded employer reached the queue if the posting spelled it differently.**
  *Red Heron*, *redheron*, *redHEron* and *Red Heron ICI* are one company, and
  excluding one of them caught only the exact spelling — two of those four got through.
  Spacing, case, punctuation and a legal form on the end no longer decide it, and a
  name that has grown a suffix is still that employer. It stays deliberately strict
  about the rest: this answer drops a lead outright, so *Blueprint* and *Acorn Systems*
  are left alone.
- **An ampersand and the word were two different companies.** *Stone & Rowe* and
  *Stone and Rowe* have the same key now, because the symbol is read as the word
  rather than stripped as punctuation. A **misspelling** still is not a spelling:
  *oakhvendesign* does not match *Oakhaven Design*, and it should not — matching names that
  are merely close, on the one answer that drops a lead outright, is how a real role
  disappears.
- **The sweep that sets waiting leads aside had its own idea of a match.** Two answers
  to *is this employer excluded* is one of them being wrong on a day nobody is looking.
  There is one rule now.
- **Typing a company name with a comma in it made two employers.** *Red Heron, Inc.*
  became *Red Heron* and *Inc.* A pasted list still splits — a line wins over a comma,
  and a legal form after a comma belongs to the name in front of it.

- **The find box read as a stray input dropped on the page.** It had nothing in it
  until you typed, so it looked like a fault rather than a dialog. It now says what it
  searches and how to close it before there is anything to show, and the wash behind it
  is heavier than the rail's — that one sits over an empty margin, this one sits over
  something somebody is reading.
- **The find overlay opened itself on every launch.** `hidden` is enforced by a browser
  rule that any class setting `display` outranks, and the overlay's own layout rule won.
  Every screen in this app hides something with `hidden`, so the fix is the general one:
  `hidden` now means hidden whatever a class says, and no component has to know.

- **A settings control cut its longest option off inside its own border.** Giving every
  control the same width stopped the empty space and started clipping instead: *Twice a
  day* and *Three seconds* were half there. A control has a floor now rather than a
  width — short ones line up, long ones take the room their words need — and with no
  room for both, it goes under its label rather than off the edge of the panel.
- **The two buttons at the foot of the rail looked like a pair.** One locks the vault
  and one changes what is on screen. **Mask for sharing** is quieter than **Lock vault**
  when it is off and clay when it is on, so it is obvious from across a room whether the
  app is masked.
- **A settings control had empty space inside its own border**, which reads as one more
  button nobody labelled. A segmented control is a `div`, so the rule that lets a
  description fill a row was stretching the control instead while its options stayed
  the width of their own words. The options share the control now, every control is the
  same width, and the description gives way first — so a row is not a different shape
  because its explanation happened to be longer.

- **The sheet showed the columns a table has rather than the ones worth reading.** A
  requisition opened on seven, of which a link, a timestamp, a page of posting text and
  a pay object were four — none of them editable or readable in a cell, and between
  them they squeezed the company to nine characters. It opens on what carries a fact
  now: a link, a timestamp, a page of text and anything holding a structure are on the
  row, and the sheet names them underneath. A table of nothing but those still shows
  itself rather than reading as empty.
- **A place was matched as a run of letters rather than a word.** Say you are in the
  **US** and every posting that used the word *discuss* was reported as naming a place
  you are — with that sentence quoted as the evidence. **UK** matched *Ukraine* the
  same way. A phrase now has to be a whole word.
- **One country, however anybody spells it.** US, U.S., USA, United States and America
  were five different places to Cairn: it looked in a posting for exactly what you had
  typed, so a posting saying *United States* did not answer a profile saying *US*. A
  country is now stored under one name and read for every spelling of itself, and the
  same holds for work authorisation — though a sentence there is kept exactly as
  written, because a form will read it. Somewhere Cairn has no table for is kept as you
  typed it, which is all it can honestly do with a city.
- **The crash log was written to a Linux path on every platform.** Electron decides
  where its logs go per platform, and the launcher was keeping a second copy somewhere
  else again — two accounts of one crash.
- **The rail called you by the machine's codename.** *What Cairn calls you* is what
  stands under the app's name now; the machine name is the fallback for when you have
  not said, which is what it was for — telling two machines apart, not naming a person.
- **A role kept on the requisitions screen was not in the pipeline.** It was in the
  vault; the shell was drawing the pipeline from a list read at unlock. Moving between
  views re-reads now — and draws a second time only when something actually moved, so
  a move that changes nothing does not flicker. Keeping or dropping a lead also
  recounts, because it changes two numbers in the rail at once.
- **A change made on one screen did not reach the next one.** The shell read your
  settings and the vault's status once at unlock and never again, so a setting changed
  in Settings was still the old value everywhere else, and the bar along the bottom
  never moved: no backup, nothing outbound, whatever had happened since. All four are
  re-read together now, wherever anything asks for a redraw.
- **The vault looked 4 kB whatever was in it.** The size skipped the write-ahead log,
  which is where everything sits until a checkpoint.
- **Lock vault wiped the key and left every record on screen.** The window refuses to
  navigate, which is what stops a renderer being sent anywhere — and it also makes
  `location.reload()` a silent no-op. Three screens were built on it. The vault now
  says when it locks, however it happened, and the interface redraws: the idle timer,
  suspend and the screen locking were all in the same state and none of them redrew
  anything either.
- **Setting a vault aside twice raised an error onto a screen with no way out of it.**
  The second press had nothing to move, and the only button on that screen was the one
  just pressed. Nothing to move is now the state it was asked for, not a failure.
- **The key module could not be built.** The build passed its output directory as an
  absolute path and napi joined it onto the working directory, so the build failed on
  a file it had written a moment earlier. Nothing caught it because `make check` does
  not build the module and the previous output was still on disk.
- **The test runner stopped finding its tests.** Electron's Node no longer expands a
  bare directory, so the suite is named by pattern.
- **Five things were exported and reached from nowhere.** A CSV writer with no button,
  two calendar helpers the interface had its own copy of, and three functions only
  their own module used. A test now fails when an export in `src/main` is called from
  neither the app nor a test.

- **Résumés.** Add the files you already have — Cairn copies them into the vault
  rather than linking, so the file that went to an employer is still the file you
  have. One is the default, each carries a note about when to use it, and importing
  the same name twice never replaces the earlier copy.
- **Which résumé went with which application is recorded at the moment of sending.**
  Six weeks later that is unanswerable, and it is the first thing an interviewer asks
  about. The ledger carries it as a column.
- **Forgetting a document removes the record, never the file.** A résumé that went to
  an employer is the only copy of what they read.

- **The database module is built for the runtime it actually runs on.** It is a native
  binding compiled for one ABI, and Electron's is not the system Node's, so `npm
  install` left one Electron could not load — which surfaced as a version-number error
  at the passphrase prompt. `npm run build` rebuilds it, and a mismatch now explains
  itself in a sentence rather than in NODE_MODULE_VERSION numbers.
- **The test suite runs on Electron's Node.** It had been running on the system one, so
  every database test passed against a configuration the app never uses while the app
  itself could not open a vault. A test now fails if the suite is run on the wrong
  runtime, which is the only way that becomes visible before somebody tries to use it.
- **Everything setup asks for can be changed afterwards.** Skills, job families, the
  pay floor and target, location and eligibility were set once and never again — so a
  skill left blank at setup stayed blank for ever, and the screen that counts them had
  nothing to count. If a check reads a value, a person has to be able to change it.
- **The shell re-reads on every redraw, and there is no longer a version that does
  not.** There were two, and choosing between them was how the front page came to be
  showing the numbers it had at startup: scheduling an interview moves a role in the
  vault, and the rail and Today went on counting the old ones until something else
  happened to re-read. A round trip to a local database is not worth a class of bug
  that says the wrong number on the front page.
- **A write redraws the view instead of reloading the window.** Every one of them
  called `location.reload()`, which throws the whole renderer away and builds it
  again: it lost the scroll position, re-ran the boot, and asked the compositor to
  rebuild every surface — a poor thing to do mid-click on a machine already unhappy
  with its graphics driver. Locking still reloads, because the vault really is gone.

- **A harvest belongs to the app, not to the screen that started it.** Walking away
  from Sources no longer stops it, coming back shows it still going, and pressing the
  button twice does not start a second run that fetches everything again — every board
  would have seen two requests from the same person a second apart.
- **Content is centred rather than pinned to the left edge**, so a maximised window is
  a comfortable column instead of a wall of empty space.
- **A machine that has crashed once does not have to crash again.** Recovering from a
  graphics segfault on every launch is worse than not using the graphics card at all,
  so Cairn remembers and skips it from then on. The state file it writes says how to
  undo that.

- **The Sources header can no longer disagree with the switches beside it.** It
  described the state the page had when it loaded, so turning a source on left the
  count, the plan and the button saying one thing while the switch said another. Two
  truths on one screen and no way to tell which.
- **Sources blocked for the same reason are said once**, rather than the same sentence
  three times over.

- **A harvest actually fetches from a listing site.** Targets were built from boards
  alone, so turning one on did nothing, for ever, and said nothing about why — an
  employer's board is polled by name and a listing site is searched, and only the
  first needs a board. The run bar now says what a run will do before it is pressed,
  and names any source that cannot run and why.
- **The same posting is kept once, not once per search term.** One role answers
  several searches, and the screens read the database as it was when the run started.
  Requisitions count towards what Cairn has already seen, so a second run does not
  offer the same thing again.
- **The window starting again when the graphics driver takes it down.** On a Wayland
  session Cairn asks for the native path, and a crash in the first half-minute is
  retried without the graphics card rather than left as a stack trace. `cairn
  --software` skips straight there.
- **The launcher runs Electron rather than npm's wrapper around it.** The wrapper
  catches a signal, prints a line about it and exits 1, so a crash arrived looking
  like an ordinary failure and the recovery above never fired. Every branch of the
  launcher is now covered by tests, because it is the one part of Cairn somebody runs
  before Cairn exists to report anything.

- **Cairn refuses to start unsandboxed, and says how to fix it.** Chromium's sandbox
  helper has to be owned by root and npm cannot make it so, which produced a fatal
  error that said nothing about what to do. The launcher checks first and explains;
  `cairn --check-sandbox` answers the question on its own. Running without a sandbox
  is not offered — this holds a résumé, and it is not a trade to make quietly.

- **The form parser took the wrong control.** It looked for a textarea before an
  input, found the *next* field's, and reported every short answer as a long one.
  The nearest control wins now, whatever kind it is.

- **A board name can no longer climb the URL path.** Tokens are validated rather than
  escaped: `%2F..%2F` is harmless to a client and a separator to a server that decodes
  before it routes, so the shape is refused outright.
- **A due date is shown as a date.** Today, Tomorrow, Overdue by three days, or a
  short date in the reader's own locale — never the ISO timestamp it is stored as.
- **`release-notes.sh` no longer defaults to the Unreleased section**, which produced
  an empty release body from the script whose whole job is preventing that.
- **Rows that looked like controls behave like them.** Rows on Today and in the
  pipeline carried a button role and did nothing when pressed. Today's rows go to the
  list the role is in, a pipeline row opens its posting, and the buttons on the two
  empty states lead somewhere.
- **Skills are a list of things rather than a line of commas.** A comma-separated
  field has to be re-read to see what is in it, and a missing space quietly makes two
  entries out of one. Pasting a list still works: it splits.
- **Cairn was being taken down by its own build.** `npm run build` forced a rebuild of
  the database binding on every run and wrote the file in place, and a running Cairn
  had that file mapped: the kernel drops a running process's copies of a file that is
  truncated, relocations included, so the next query jumped through a table that was
  back to its on-disk state. Every crash recorded on this machine, on both rendering
  paths, was this, and none of them was the graphics driver. The binding is rebuilt
  only when Electron cannot load it, the key module is placed by rename, and neither
  happens while Cairn is running.
- **The vault can be looked at, taken out and put back.** Everything Cairn holds sat
  in one encrypted file it alone could read, which is the point of it and also a dead
  end: no way to see a figure it does not show you, no way to keep a copy, no way to
  get anything back in. **Vault & privacy → Your data** lists every table with its
  size, shows any of them fifty rows at a time, and takes one `SELECT` — with the
  database itself put in read-only mode while it runs, so a mistyped statement cannot
  cost anything.
- **Write everything out, and read an export back in.** One JSON file, every table,
  every row. It says in those words that the file is plain text outside the vault and
  that your passphrase does not protect it. Reading one back adds what is missing and
  restores what changed, matched on id, and never removes anything — Starting over is
  where that is asked about in those terms.
- **The status bar can say when you last backed up.** It said *No backup yet* for the
  life of the app, because nothing could ever set it.
- **An error says what went wrong rather than how it travelled.** A message thrown by
  the main process arrived on screen wrapped in the method being invoked and the class
  it was thrown as, so a sentence written for a person read as plumbing. All eleven
  places that show an error now show the sentence.
- **A link you already track says so.** Adding a role by hand with a link already in
  the pipeline answered `UNIQUE constraint failed: opportunity.url`; it names the role
  it clashes with.
- **A sweep of every wire in the app, and everything it found.** Each miss so far had
  one of three shapes — a screen reads a value nobody can set, something can be set
  that nothing reads, or a way in exists that nothing calls — and every one was found
  by somebody using it. They are all mechanical, so they are checked by the build now,
  and here is what the first run of that check turned up.
- **Five things setup asks about you were read by nothing.** Where you are and whether
  you will only work remotely are compared against a posting's location clause now.
  The currency you chose is compared before your pay floor is, so a range in another
  currency is reported rather than measured against a number that means something
  else — pay drops a lead outright, so that was a real role removed by arithmetic
  nobody could see. And the two eligibility answers are offered whenever a form asks
  them, which is what the screen collecting them has always said would happen.
- **Three things the app could do and nothing could reach.** A role you were sent or
  found somewhere Cairn does not read can be added by hand — the guide has told people
  to do that since the first version and there was no way to. A document can be
  forgotten, which removes the record and never the file. An interview can be
  cancelled.
- **The harvest schedule is real.** *Check sources* offered every six hours, twice a
  day and once a day, and nothing anywhere acted on any of it. Cairn now checks when
  one falls due, says on Sources when the next one is, and starts the clock when you
  set the cadence rather than fetching on the spot.
- **A wait between requests and the first day of the week can be changed**, having
  been read by the gate and the calendar and settable from nowhere.
- **A table and a column that nothing had ever queried** are dropped, and the build
  fails if more appear.
- **Every direction in the app and the guide points at somewhere that exists.**
  Splitting the long screens into sections moved six things the text still described
  by their old places, and the guide sent people to Settings for sources, to Documents
  for the answer bank, and to a panel on the Pipeline that did not exist.
- **A finished harvest reaches the whole app.** It redrew the screen it was started
  from and nothing else, so the rail went on counting what it had counted before the
  run and the queue itself showed nothing until the window was reloaded.
- **The headline counts sources that can actually run.** Four employer-board sources
  arrive switched on and none of them can do anything until you add a board, so *9
  sources on* beside *0 boards* read as boards having gone missing. It says how many
  of the ones you have on can run, and the boards panel says plainly that no employer
  list ships and none ever will.
- **The menu is Cairn's own, and hidden until Alt.** The one before it was Electron's:
  Reload, Force Reload and Toggle Developer Tools — a console on an application
  holding somebody's vault — and a Help item that opens electronjs.org, on an app
  whose central claim is a count of every request it makes.
- **`cairn --crashes` says what is now known**: every crash recorded on this machine
  was a native module rewritten under the running app by its own build, so a machine
  still skipping its graphics card from one of those is skipping it for nothing.
- **Three different things stopped being one number.** *Already in your list* counted a
  role in your pipeline, the same posting arriving under a second search term, and a
  posting whose link is only remembered because you said no to it once. On a real run
  that was 283 postings hiding 197 duplicates. They are counted and named separately
  now.
- **Cairn shows the links it is still saying no to, and will forget them.** Deleting the
  set-aside leads leaves the link hashes behind on purpose — they are what stops the
  same postings coming back — but they then go on being counted by a run after there
  is nothing left to look at, which reads as the figure being wrong. The count is on
  the Set aside page with a way to clear it.
- **The empty boards lane points somewhere that exists.** It said to add a board
  *below*, and the form moved to another section when Sources was split, so it pointed
  at nothing. It names the section and takes you there.
- **A run reads the two kinds of source side by side, and shows both.** Employer
  boards and listing sites have nothing to do with each other — one is polled by name,
  the other is searched, and they are different hosts — so one being slow was no
  reason for the other to wait. Each has its own card, its own colour and its own
  progress bar.
- **The gate spaces each host rather than the whole app.** Politeness is owed to a
  server, not to the internet: one clock for everything had employer boards and
  listing sites queueing behind each other while neither was being hurried. Each host
  is still asked no more often than the request delay.
- **One kind at a time is a setting that does something.** It was in the settings
  screen and nothing anywhere read it. It now decides whether the two kinds are read
  together or one after the other, and it is off by default.
- **Set aside is somewhere you can look.** Saying *Not for me* only marked a lead: the
  rows stayed in the vault for ever, invisible, so a queue of 53 sat above hundreds
  nobody could see or count. Requisitions has two halves now — waiting, and set aside
  with what is in it. A lead can be brought back, which forgets the link so the next
  run does not drop it again on sight.
- **And a delete that deletes.** *Delete them for good* removes the rows. The link
  hashes are kept on purpose, because they are what stops the same postings arriving
  all over again, and a hash holds no address.
- **The rail, Today and the Interviews page are one number.** A role reaches the
  interviewing stage from the pipeline without anybody putting a date in, and the
  Interviews page could not show one of those — so it read empty while the front page
  counted two, and renaming the tile only renamed one side of the disagreement. The
  page accounts for every role at that stage now: the next one in full, the rest of
  the diary, and the ones with no date yet, each with a date field on it.
- **What one run did is figures rather than a sentence.** The sentence named the three
  commonest reasons while reading as the whole account, so the numbers on screen did
  not add up to the number read — a run of 771 accounted for 766 of them. Every reason
  is listed now, they reconcile, and anything unaccounted for is said out loud rather
  than left to be noticed.
- **It no longer claims nothing was new when plenty was.** *Nothing new since the last
  run* appeared whenever anything at all was already in your list, while hundreds of
  genuinely new postings were being set aside on the title beside it. It appears only
  when already-in-your-list is the sole reason.
- **Sources is three sections** — Harvest, Employers, Feeds — so what a run will do and
  what the last one did have room to be a table rather than a paragraph.
- **The figures on Today go where they are about.** Four counts sat on the front page
  with nowhere to go, which is a question answered and then taken away. Live
  opportunities opens the pipeline, applications and the reply count open the ledger,
  and the interview count opens Interviews.
- **A source is edited from a pencil beside its name.** *Make it mine* was a button
  wide enough to need three lines of the space left over next to the switch, on every
  row, for the rarest thing on the screen. Whether a feed is already your own version
  is said in words on the row instead, next to where its requests go.
- **An interview can be scheduled.** Recording that one happened and having one to
  prepare for were two different things, and only the first existed — the event moved
  the role to interviewing and Today counted it, while Interviews and the calendar
  stayed empty, because nothing anywhere in the app could make an interview. There is
  a date on the application's timeline now, and saving it moves the role and writes
  the timeline entry by one path rather than two.
- **The rail counts interviews**, and Today's tile is called *At interview* — the stage
  a role is at, which is not the same thing as an interview in the diary. One word for
  both had them contradicting each other on the front page.
- **Settings is four short sections** — You, Your search, Fetching, The app — and
  **Vault & privacy is three**. Ten panels on one scroll is a page somebody stops
  reading. Both use one implementation, so they cannot drift.
- **The accent has a control you can find.** It could only be changed from four
  unlabelled dots at the foot of the rail, which is not somewhere anybody looks for a
  colour. It is a row in Appearance now, and the dots follow it.
- **A way to start over, and neither half deletes anything.** *Set aside every waiting
  lead* clears a queue that filled up while the rules were still being worked out.
  *Start over* moves the whole vault — the database, the salt its key comes from, the
  documents, the feeds you wrote — into a folder of its own beside it, and putting it
  back is renaming that folder. Both ask first, and they ask from the main process, so
  no path to either can be written that skips the question.
- **Employers you never want to see.** The screen has always been one of the four that
  can drop a lead outright, and nothing in the app could put a name in the list, so it
  was always empty. It is a list in Settings now, and any lead carries *Never show me
  this employer again* — which takes every waiting lead from them with it, because
  excluding somebody and still finding eleven of their roles in the queue is the rule
  visibly not working.
- **The employer named on a posting drops it; the name merely appearing in the text
  does not.** An agency listing names its client in the prose and nowhere else, which
  is the case worth catching — and so does a posting that just mentions who they
  partner with. Dropping on a mention would take the second with the first and do it
  invisibly, because the lead it removed is the only thing that could have said so. A
  mention arrives flagged, with the sentence quoted.
- **The posting age limit can be changed.** It said *past your 30-day limit* about a
  number nobody had ever been asked for. Both of these were the same defect, so the
  build now fails if the screening layer reads a setting the settings screen never
  mentions.
- **A posting whose title is none of the ones you named is set aside again.** Reported
  rather than enforced, a listing site hands over its whole catalogue: one run put 519
  leads in the queue, and a page nobody reaches the bottom of is a queue nobody uses.
  On the same live feeds the gate takes a run of 744 postings down to 67. The cost is
  real and unchanged — a role with a title nobody thought to search for is never seen
  — so every run says how many it set aside on the title, and the refusal names where
  the list of titles is kept.
- **The job titles in a family are a list of things rather than a line of commas**, the
  same as your skills and your locations: one at a time, each visible, and a pasted
  list splits. A missing space after a comma used to make two titles out of one, which
  here means a search term nobody wrote.
- **Editing a family no longer folds the editor away.** Every change redrew the whole
  panel, closing the disclosure and losing your place on the one screen you sit and
  work through. A change to a family's titles now redraws nothing, and the line saying
  what it searches first is rewritten where it stands.
- **A listing site's own salary guess no longer ranks a role.** A feed's pay fields
  were read whenever they were there, and a feed that never says where its figures
  came from was taken as saying the employer published them — so Jobicy's and Remote
  OK's own estimates arrived as bands, labelled as the employer's. Pay is one of the
  four screens that can drop a lead outright, so that did not merely read wrong: it
  dropped real roles under the floor and admitted ones nobody asked for. A figure is
  read only when the feed says who published it, by flag or by word, with unknown
  counting as no.
- **Every shipped listing site now says what it does about pay**, because the four did
  three different things and looked identical on the screen where you decide whether
  to turn one on.
- **The install and release scripts are in the repository.** The user-level ignore
  file on the machine that made it excludes `*.sh`, and nothing negated it, so
  `make install` and the release workflow called files a fresh clone did not have.
- **A crash without the graphics card is written down too.** The launcher handed the
  process over on that path, so five crashes on it left nothing but *started* lines
  in the log. Both paths now record which signal, how long in and which path, beside
  the app's own lines, and `cairn --crashes` lists the dumps Chromium wrote — with a
  warning that a dump holds memory from the moment of the crash. The messages stop
  naming the graphics driver as the cause; it is what the retry tries, not what was
  found.

## [0.1.0] - 2026-09-07

The first cut: a vault, a setup flow, and the screens that read a posting.

### Added

- **An encrypted vault.** SQLite with ChaCha20-Poly1305 at the page level, so the file
  is never plaintext on disk even while the app is open. The key is derived with
  Argon2id in a small Rust module and wiped when the vault locks.
- **A setup flow that assumes nothing.** A fresh install has no profile, no pay floor,
  no job families and no employers. It cannot show a pipeline because there is not one
  yet, so it asks instead.
- **Screening that reports rather than decides.** Exclusions, duplicates, pay against a
  floor, provenance, freshness, buried location clauses, unnamed employers, partial pay
  ranges and clearance. Fit, family, location and specialty are left open with their
  evidence quoted.
- **A pay parser** that survives descriptions escaped twice, annualises an hourly rate
  and says so, and refuses a reversed range rather than swapping it.
- **One network gate.** Every outbound request is counted and recorded where the user
  can read it, and a test fails the build if a second call site appears.
- **Locking** on request, after an idle period, and on suspend or screen lock.
- **A design system compiled from tokens.** Four accent themes, light and dark, three
  text sizes and two densities, with no colour literal in any component stylesheet.
- **Defaults worth having and nothing more:** six job feeds, all switched off; a
  sixteen-family job taxonomy; three cover letter and two résumé skeletons; and the
  questions application forms ask, without answers.

[Unreleased]: https://github.com/kingletas/cairn/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/kingletas/cairn/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/kingletas/cairn/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/kingletas/cairn/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/kingletas/cairn/releases/tag/v0.1.0
