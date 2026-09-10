# From nothing to a working job search

This is for somebody who has never seen Cairn. By the end you will have it running, set up, and tracking a real role. It takes about fifteen minutes, most of which is waiting for things to install.

## What you need first

**There are no ready-made installers yet.** Once a release is published, you'll be able to take the file for your machine from the [releases page](https://github.com/kingletas/cairn/releases) instead — [docs/installing.md](installing.md) says which, and what the unsigned warnings on macOS and Windows mean — and skip to *Choose a passphrase*.

The rest of this page builds it from source, which is the version with nothing to take on trust. You need three things:

- **Node 22.12 or newer.** Check with `node -v`.
- **A Rust toolchain.** Check with `rustc --version`. If you have not got one, [rustup.rs](https://rustup.rs) installs it in one command.
- **A C compiler.** On Ubuntu, `sudo apt install build-essential`. On macOS, `xcode-select --install`.

## Get it running

```bash
git clone https://github.com/kingletas/cairn.git
```

```bash
cd cairn && make deps
```

That downloads the dependencies. It takes a few minutes the first time, mostly Electron.

```bash
make run
```

Cairn builds and opens. **The first build is the slow one** — it compiles the Rust key module and rebuilds the database binding for Electron. After that it is seconds. Quit Cairn before building again: a module rebuilt under a running app takes it down, so the build refuses to do it.

**If the window dies**, Cairn starts again without the graphics card and says so, and remembers to skip it from then on; `cairn --try-graphics` undoes that. It draws a little less smoothly and nothing else changes. `cairn --crashes` prints what Cairn recorded about the crash, and it is the thing to include in a bug report.

**One step needs a password, and only once.** Chromium isolates the parts of Cairn that read a web page, and the helper that does it has to be owned by root. `npm` installs it as you, so Cairn tells you the command and stops rather than running without a sandbox. Run what it prints, then start it again. `cairn --check-sandbox` says whether it is set up.

## Choose a passphrase

The first screen asks for one, and there is no way past it.

Everything Cairn keeps lives in one encrypted file on your machine. The passphrase is what opens it. There's no account, no email and no reset — **if you lose the passphrase, the records are gone**, and nobody can get them back for you. Put it in a password manager now rather than later.

Ten characters is the minimum. Longer is better than more complicated: four unrelated words beat one word with symbols in it.

## Say what you are looking for

The second screen asks for a few things. Only two are required:

- **What to call you.** This appears nowhere except your own screen.
- **What kind of work.** Pick one or more families. These decide what Cairn searches for, and you can edit the exact job titles later. The list you are picking from is a sample meant to be replaced: when you know what you are actually searching for, put your own families in `families.json` in your vault folder — same shape as the shipped one, and `"replaceShipped": true` in it drops the sample entirely.

Two are optional, and worth filling in anyway:

- **The lowest pay you would consider.** Cairn compares the top of any range it finds against this. Leave it blank and the pay screen simply reports what it found without judging it.
- **Skills worth counting.** Cairn counts how often each appears in a posting and shows you the numbers. It never decides for you what the count means — a technology mentioned once in a list of requirements is a very different job from one mentioned nine times.

Press **Finish setup** and Cairn opens on Today, which is empty, because nothing has happened yet.

## Add the first role by hand

Before turning on any fetching, add something you already know about. It is the quickest way to see how the app thinks.

Go to **Pipeline → Add a role by hand** and give it a company, a role and the link. It lands in **Considering** with no next action.

Give it one. A role with no next action is a role that quietly stops moving — that is the whole reason the field is on every row.

**If you already keep a spreadsheet**, bring the whole thing in: **Vault & privacy → My data → Read a spreadsheet of roles** takes a CSV. It needs a column for the company and one for the role, and reads a link, a location and notes when it finds them. Everything arrives in Considering, and anything already in your list is left alone.

## Turn on a source

Go to **Sources → Feeds**.

**Nothing fetches until you say so.** Every source arrives switched off, and **Settings → Fetching → Check sources** starts on *Only when I ask*. That's deliberate: a request you didn't press a button for is one you can't audit. Turn a schedule on and **Sources → Fetching** says when the next unattended check falls due, so a schedule is never something you have to take on trust.

Two kinds of source, and the difference matters more than it looks:

- **An employer's own job board** — Greenhouse, Lever, Ashby, SmartRecruiters. The pay range and the location come from the employer. If the role has gone, it is simply not there any more.
- **An aggregator** — a site that republishes other people's listings. Broad, which is what makes it useful for finding employers you have not met. Every figure on it is a claim, and claims have been wrong by tens of thousands at the top of a range.

Cairn labels which is which on every row, and **Only rank pay an employer published** decides whether a claim is allowed to affect the order.

To add an employer's board: open their careers page, copy the URL of any job on it, and paste it into **Sources → Employers**. Cairn reads the board token out of the URL and polls that employer directly from then on.

**To add a listing site Cairn has never heard of**, press **Write a feed** on the Sources screen. A listing site is an address with the search term in it and a list saying what its fields are called — `title`, `company_name`, and so on. The form asks for exactly that.

**Make it mine** opens one of the shipped feeds in the same form, so you can change how it reads a field without touching the app. Your version is saved in your vault beside the original, and removing yours brings the original back.

The same thing as a file is a *source pack*, which is how you would send a feed to somebody else. **Import a source pack** takes one in.

Nothing happens when you import one. It arrives switched off like every other source, the screen tells you which host it would reach, and there is nowhere in the format to put a password or a key — so a pack is safe to send to somebody else, and one somebody sends you cannot fetch anything until you say so.

## Read what comes back

Fetched roles land in **Leads** — roles nobody has judged yet — and not in your pipeline. Keeping the two apart is the point: the pipeline is roles you decided to chase, and mixing unscreened leads into it makes the list untrustworthy within a week.

Each one shows what Cairn could work out and what it would not:

**Answered outright.** Whether you excluded the employer, whether it is already in your list, whether the top of the pay range clears your floor, where the figure came from, and how old the posting is.

**Quoted, not judged.** If the posting says anything about being in an office, Cairn shows you that sentence. It doesn't decide whether two days a week is acceptable — it makes sure you read it before you decide.

**Left to you entirely.** Whether it is a fit, which family it belongs to, whether the location works, and whether your specialty is the job or a line in the requirements. Cairn shows the mention counts and stops there.

That last part is deliberate and it is worth trusting. A confident paragraph from a machine reads exactly like an answer, and in a job search the cost of a wrong one is a month.

**Keep** moves a lead into the pipeline. **Not for me** drops it, and Cairn remembers a hash of the link so the same posting doesn't come back — the link itself is not kept.

**There is a third answer, on the lead itself: *Never show me this employer again*.** It adds them to **Settings → My search → Employers I never want to see** and sets aside every other lead of theirs waiting for you. From then on their postings never reach the queue.

Where the name only appears in the *text* of a posting somebody else listed — which is what an agency posting on their behalf looks like — the lead still arrives, flagged, with the sentence quoted. A posting that merely mentions them reads exactly the same way.

## Bringing an assistant, if you want one

Cairn has no model built in and no service behind it. If you want one, you bring your own key — and everything about how it behaves is designed so you never have to take Cairn's word for what it sent.

Go to **Settings → Assistant**.

**Pick a provider.** Anthropic, OpenAI, Gemini and Mistral are there, along with Ollama for a model running on your own machine, and *Something else* for anything that speaks the same shape. Two protocols cover all of them, so a provider Cairn has never heard of usually works by pasting its address in.

**Paste your key and press Save the key.** It is sealed by your operating system's keychain before it is written into the vault, so it is locked twice. On Linux, if your desktop is standing in for a keychain with a fixed phrase, Cairn refuses to hold a key at all and tells you what to set up — a fixed phrase is not a lock, and pretending otherwise would be the worst thing it could do here.

**Press Ask it which models it offers**, and pick one. Cairn ships no model list, because a list in an app is a list that goes stale; your provider knows what it has.

That's it. Four buttons appear on the screens they belong to:

- **Read this posting for me**, on a lead. This is the useful one. Cairn's own rules read a pay range written as a range; they don't read *up to about 190k for the right person*, or an office requirement three paragraphs down. The assistant reads those out **as quotes**, and Cairn checks every quote is really in the posting before showing you anything. One that is not is thrown away and said out loud. The band still comes from Cairn's own parser reading that sentence, not from a figure the model typed.
- **Draft it with the assistant**, in Documents. A first draft lands in the editor, unsaved, with its checkable sentences listed beside it. The rules about what may never reach an employer are unchanged.
- **Suggest one**, on a question in the answer bank you have opened and not answered. It lands in the box for you to edit; nothing is written into the bank by the assistant.
- **Look an employer up**, on the Pipeline. Only for a provider that can search and cite. Every sentence has to name a source or Cairn keeps none of the note — half sourced is the harder one to read, because nothing marks which half.

**Nothing is sent without showing you first.** Every request opens a panel with the address, the model, the size, and the whole payload — the system prompt and every message, in full, never summarised. **Send it** or **Not now**. If you get tired of that for one particular task, **Settings → Assistant → Sending without being shown** turns it off for that task alone, and the request still appears afterwards with everything the panel would have shown.

**Where to check up on it: Vault & privacy → What I asked the assistant.** Every question, with the host, the model and the token counts. The same requests are in **What has left this machine** too, because they went through the same gate a job board goes through, and they are counted in the bar along the bottom like everything else.

**What it will not do.** It never decides whether a role fits, never files anything, never fills a form and never sends anything to an employer. A confident paragraph from a machine reads exactly like an answer, and in a job search the cost of a wrong one is a month.

## Check what has left your machine

Go to **Vault & privacy → What has left this machine**.

Every request Cairn has ever made is listed there, newest first, with what it was for. The number in the bar along the bottom is today's count.

This is the part to hold Cairn to. It says it doesn't fetch unless you ask, doesn't send your search criteria anywhere, and doesn't phone home. That list is how you check, rather than take its word for it.

## Moving around

**`Ctrl` and a number** jumps between views — `⌘` on a Mac. The first nine in the rail take `Ctrl+1` to `Ctrl+9`; **Vault & privacy is `Ctrl+0`** and **Settings is `Ctrl+,`**. Hover a rail button and it tells you its own.

## Being reminded

**Settings → The app → Alerts** turns on one notice a day: interviews today, anything due, anything past due, in a single notification. It is off until you ask for it, and it comes from your own machine — nothing is scheduled anywhere else.

**Quiet hours** are 22:00 to 08:00 unless you change them. Set both to the same time for no quiet hours at all.

## Finding something again

**`Ctrl+K`** — `⌘K` on a Mac — searches everything: roles, leads, answers, documents and interviews. Type two words and it narrows to what matches both. A result shows the sentence it was found in when that says more than the title, and clicking one takes you to the screen it lives on.

## Before somebody looks at your screen

**Mask for sharing**, in the rail under the accent colours, replaces every employer and every figure with dots. The roles stay, so you can still show somebody how the app works without showing them who you are talking to or what anybody pays. The same switch is in **Settings → The app**.

It stays on until you turn it off, including across a lock — the point is that it can't come off by accident while a call is still running.

## When you stop for the day

Press **Lock vault**, or leave it — Cairn locks itself after fifteen idle minutes, and when your machine suspends or your screen locks. Locking wipes the key from memory; unlocking derives it again from your passphrase.

You can change the idle time in **Settings → The app → Locking**, including turning it off.

## Copied in, or linked

Cairn copies a file you add into the vault, which is why what went to an employer is still the file you have. **Settings → The app → My files** can switch that to linking instead — the file stays where it is and Cairn points at it.

**A linked file is not in your vault**: not encrypted, not in an export, and gone if you move or delete it. The row says so, and Cairn tells you when one has disappeared rather than failing quietly. Changing the setting only affects the next file you add.

## Tailoring a résumé

Most people end up with a few. **Replace**, on a résumé in Documents, points it at a newer file — the one it replaces stays in your vault under its own name, with the date it was replaced and a button to open it.

**An application remembers the file that went**, not just which résumé it was. So when you replace one, everything already sent still points at what that employer actually read, and the ledger says *an earlier version* so you know before you walk into the interview.

## Getting rid of it

**Vault & privacy → Starting over** has three things and only the last one deletes.

**Set aside every waiting lead** clears the queue and leaves everything else. **Start over** moves your whole vault to a dated folder beside it, so putting it back is renaming that folder. **Erase everything** deletes: your vault, every vault set aside earlier, Cairn's own log and its crash dumps. It asks you to type *erase everything* first, because there is no undo.

Anything you wrote out with **Write everything out** is a file of your own and Cairn never touches it.

## What next

- **Write your answers once.** The **Answer bank** holds the questions every application form asks. Fill one in and Cairn offers it the next time a form asks something close to it. This is the only thing in the app that gets better the longer you use it.
- **Start from a template.** Three cover letter skeletons and two résumé skeletons ship with Cairn, all empty. The reverse-chronological résumé is what most applicant tracking systems parse best.
- **Use your own words.** **Settings → My search → What I call each stage** renames any of the five stages to whatever your process calls them, and lets one borrow another's colour. The five themselves stay, because three of them do something rather than say something — the row for each one tells you which.
- **Add boards as you find them.** The employer list grows as you search, and it is the part that keeps working when an aggregator closes its API.
