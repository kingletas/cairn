# Why Cairn exists

**Because looking for work means keeping track of forty things at once across six websites that do not talk to each other, and the only record of what you already applied for is your own memory and a browser history.**

## The problem

A job search is a project with a pipeline, deadlines, and a lot of near-identical paperwork. Nothing you are given to run it with treats it as one:

- **The postings are scattered.** Company boards, aggregators, and four or five listing sites, each with its own account, its own saved searches, and no idea the others exist.
- **The record is a browser history.** Whether you already applied somewhere, what you said, what the salary was, who you spoke to and what you promised to send them — none of that survives closing the tab.
- **The paperwork repeats.** The fifth application asks the same eleven questions the first four did, and you retype the answers because there is nowhere they live.
- **The screening is manual and endless.** Most of what a feed returns is wrong for you on grounds you could state in one sentence — the pay, the location, the seniority — and you read all of it anyway.

## Why not a spreadsheet

A spreadsheet is the honest baseline and a lot of people use one. It records; it does not read a feed, it does not screen, and it does not fill anything in. Every row still costs the same manual work, and it silently stops being current the week you get busy.

## Why not one of the existing trackers

They are accounts on somebody else's server. To be useful, one has to hold your résumé, the salary you would accept, the employers you would rather not hear from, and the complete list of places you have applied — which is, taken together, an unusually clear picture of your working life and your intentions, sitting in a product whose business model you did not read.

That is the part worth being precise about, and it is why this is a local application rather than a better web one.

## Why not have it decide for you

Because the decisions worth automating and the decisions worth making are not the same set, and the tempting ones are on the wrong side of that line. Whether a role actually fits, whether the location really works, whether a technology in the requirements is the job or a line somebody pasted in — those are judgement calls, and a product that makes them for you is confidently wrong at scale.

## What the reason decided

- **One encrypted file on your machine.** No account, no server, no sync. Page-level encryption, so the file is never plaintext on disk — including while the application is open.
- **Nothing is fetched until you ask.** No schedule you did not set, and the bar along the bottom counts every request made today. A single function reaches the network; a test walks the source and fails the build if a second call site appears, because that count is only true if nothing can route around it.
- **Every screen quotes the sentence it read.** When a posting says you have to be in an office two days a week, you get that sentence, not a verdict. Only your own rules can drop a posting.
- **What ships is knowledge, never a person.** Feeds, a job-family taxonomy, document skeletons and the questions forms ask — with no answers in them. A test fails the build if an exclusion list, a board list or an answer ever appears in the defaults.
- **A model is something you bring, if you want one.** No key ships, nothing is reached until you set one up, and every request is shown in full before it goes. It never decides whether a role fits.

## Where the name came from

A cairn is the stack of stones people build on a long walk so the next person — usually themselves, three weeks later — can tell where the path went.
