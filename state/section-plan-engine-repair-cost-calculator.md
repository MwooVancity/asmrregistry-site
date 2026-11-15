# Section Plan: engine-repair-cost-calculator
**Slug:** engine-repair-cost-calculator
**Primary keyword:** engine repair cost
**formulaId:** engine_repair

---

## Reader's situation

Someone searching "engine repair cost" just got bad news — a mechanic told them their engine has a problem, or a warning light appeared, or the car died. They're standing at a fork: pay for the repair, cut their losses and replace the vehicle, or try to limp along until they can decide. The decision window is 24-72 hours because many can't afford a long-term rental or don't have a backup vehicle. They have a quote in hand (or are dreading getting one) and need to know whether the number they heard is reasonable, what drives that number, and whether fixing it even makes financial sense for a car that may be worth less than the repair.

---

## Arsenal selection

| Move | Why |
|---|---|
| **Complete worked bill** | Engine repair has 3-5 cost layers (teardown, parts, labor, reassembly, post-repair check). Competitors show a range; showing the arithmetic builds trust and lets readers reverse-engineer their quote. |
| **Decision tree** | Repair vs. replace is the primary unresolved question. A clear threshold ("if repair > 50-75% of vehicle value, replace") turns an anxiety decision into a math problem. |
| **Exact scripts** | Readers don't know what to say to a mechanic — "can you show me the flat-rate book hours?" or "is that OEM or aftermarket?" are scripts they can use tomorrow. |
| **When NOT to spend** | The upsell refusals (unnecessary teardown fees, dealer markup on remanufactured parts) save real money. Against-interest: sometimes dealer IS the right call (warranty work). |
| **Show the arithmetic** | Labor hours × shop rate + parts is visible math. Readers can audit their quote in real time. |

---

## Planned sections (reader journey order)

### Section 1: What Engine Repair Actually Costs (heroAnswer)
- **JSON field:** `heroAnswer`
- **Why it helps:** Gives the number first, before the reader reads anything else.
- **Arsenal move:** Answer first, then why.
- **Data available:** Repair type ranges from aio-inputs: minor repair (few hundred dollars) through engine replacement (several thousand). Labor rate default $100-$130/hr from BLS regional median.
- **What competitors miss:** Most give a single wide range ($500-$10,000) with no breakdown. We break it into repair type tiers with the calculator CTA naming specific inputs.

### Section 2: How the Calculator's Inputs Drive Your Number
- **Heading:** "The Four Variables That Move Your Estimate"
- **JSON field:** `reference[0]`
- **Why it helps:** Teaches the reader how to use the calculator for their specific situation — the moat bridge.
- **Arsenal move:** Show the arithmetic (labor hours × shop rate = labor subtotal; parts tier multiplier on base parts cost).
- **Data available:** shopType (dealership vs. independent: 20-40% rate gap), partsTier (OEM vs. aftermarket vs. reman: 20-40% cost swing), engineSize (flat-rate hours scale with displacement), laborRate BLS median $100-$130/hr.
- **What competitors miss:** Never name the inputs readers can actually change. "Labor varies by region" is useless; "switch the shop type dropdown — an independent at $90/hr vs. a dealership at $135/hr saves $200-$400 on a 4-hour job" is actionable.

### Section 3: Repair Type Cost Breakdown
- **Heading:** "Minor Tune-Up to Full Replacement: What Each Repair Tier Costs"
- **JSON field:** `reference[1]`
- **Why it helps:** Lookup table — reader finds their row and understands their position before calling a shop.
- **Arsenal move:** Lookup table (repair type → parts range → labor hours → total range).
- **Data available:** From aio-inputs: minor repair, head gasket, timing belt/chain, engine rebuild, engine replacement (new crate, reman, used pull).
- **What competitors miss:** They list ranges without flat-rate hours. Showing hours lets the reader detect labor padding ("they quoted 12 hours for a timing belt — book says 6").

### Section 4: Rebuild vs. Replace — The 50% Rule
- **Heading:** "When the Repair Bill Exceeds the Car's Value"
- **JSON field:** `reference[2]`
- **Why it helps:** The repair-vs-replace signal is the most consequential decision this reader faces. The calculator flags it, but the prose explains the math behind the flag.
- **Arsenal move:** Decision tree with explicit threshold (repair > 50-75% of vehicle value → lean toward replace; >100% → replace unless vehicle has sentimental or classic value).
- **Data available:** repairVsReplaceSignal output from calculator; vehicleAge input (older vehicle = lower value, tipping point comes sooner).
- **What competitors miss:** Most say "consider replacement" with no threshold. We name the number and explain it.

### Section 5: The Hidden Costs on Every Engine Repair Bill
- **Heading:** "Four Charges That Appear After the Estimate"
- **JSON field:** `hiddenCosts[0]`, `hiddenCosts[1]`, `hiddenCosts[2]`
- **Why it helps:** The estimate covers parts + labor for the named repair — not diagnostic fees, teardown, secondary failures found during teardown, or post-repair check.
- **Arsenal move:** When NOT to spend (decline the unnecessary add-ons); exact script ("ask them to itemize teardown separately from repair labor").
- **Data available:** aio-inputs disclaimer: "excludes diagnostic fees, towing, rental car, taxes, and any secondary repairs uncovered during teardown."
- **What competitors miss:** Teardown is often billed separately and can run 2-4 hours before a shop even confirms the root cause. Competitors don't mention secondary repair exposure.

### Section 6: Shop Type, Parts Tier, and Where Your Money Goes
- **Heading:** "Dealership vs. Independent vs. DIY: What Each Costs and Why"
- **JSON field:** `reference[3]`
- **Why it helps:** shopType is the largest single cost lever per the calc inputs; readers need to understand what they're buying at each tier.
- **Arsenal move:** A-vs-B table (dealership vs. independent vs. chain) + against-interest statement (dealer IS right when: warranty, ADAS calibration required, proprietary scan tool needed).
- **Data available:** shopType dropdown, partsTier dropdown (OEM / aftermarket / reman).
- **What competitors miss:** "Independent shops are cheaper" without explaining when they're the wrong choice (some engine electronics require dealer scan tools). We give the exception.

### Section 7: DIY Threshold — What You Can and Can't Do Yourself
- **Heading:** "Engine Repairs You Can DIY and the Ones You Shouldn't Touch"
- **JSON field:** `diySection[0]`
- **Why it helps:** DIY is a legitimate option for some repairs (spark plugs, sensors, belts on some engines) but catastrophic on others (head gasket, timing chain on interference engines). A clear line saves money and prevents engine destruction.
- **Arsenal move:** Decision tree (repair complexity → DIY viable / not viable), exact scripts ("check if your engine is interference before pulling the timing cover").
- **Data available:** shopType = DIY in aio-inputs; repair type complexity gradient.
- **What competitors miss:** Whether the engine is interference or non-interference matters enormously for DIY timing belt/chain — a slip on an interference engine destroys pistons. No competitor mentions this.

### Section 8: Cost of Delay — What Happens If You Wait
- **Heading:** "Four Engine Problems That Double in Cost If You Drive Another Week"
- **JSON field:** `callout[0]`
- **Why it helps:** Urgency is real here — a coolant leak becomes a warped head; an oil leak becomes spun bearings. Helps readers triage correctly.
- **Arsenal move:** Scenario table (symptom → days to catastrophic failure → cost of waiting vs. acting now).
- **Data available:** Repair types from aio-inputs (minor → severe escalation paths).
- **What competitors miss:** The urgency signal. Competitors describe costs but not the cost of inaction.

### Section 9: Insurance, Warranty, and Extended Coverage
- **Heading:** "When Your Warranty or Extended Coverage Pays for the Repair"
- **JSON field:** `callout[1]`
- **Why it helps:** Many readers don't know factory powertrain warranties cover major engine repairs. Extended warranties and CPO coverage are commonly forgotten. This is the COMMONLY DROPPED item.
- **Arsenal move:** Checklist (powertrain warranty still active? → call dealer first; extended warranty? → call before authorizing ANY teardown; CPO? → same).
- **Data available:** No gov source — decision-level only per template rule.
- **What competitors miss:** Extended warranties typically require pre-authorization. A reader who lets the shop tear down the engine before calling their warranty company loses the claim. This is catastrophic and entirely preventable.

### Section 10: Questions to Ask Before You Authorize the Repair
- **Heading:** "Six Questions That Protect You at the Service Counter"
- **JSON field:** `reference[4]`
- **Why it helps:** Readers don't know what to say. Exact scripts close the information gap between a mechanic and a non-mechanic.
- **Arsenal move:** Exact scripts (verbatim).
- **Data available:** Flat-rate hours from aio-inputs context; parts tier; OEM vs. aftermarket.
- **What competitors miss:** No competitor gives verbatim scripts. "Ask about parts quality" is useless. "Say: 'What's the book time for this repair, and how many hours are you billing me?'" is actionable.

### Section 11: Regional Price Variation
- **Heading:** "Engine Repair Rates by Region: How Much Location Moves the Number"
- **JSON field:** `reference[5]`
- **Why it helps:** BLS regional labor rate data shows a 30-40% spread between low-cost and high-cost metros. The calculator pre-fills from regional median; this section explains why to adjust.
- **Arsenal move:** Show the arithmetic (BLS OES regional rate × flat-rate hours = regional labor cost).
- **Data available:** laborRate input pre-filled from BLS regional median $100-$130/hr.
- **What competitors miss:** They give a national range. We explain the input the reader can change and what BLS data shows by region.

### Section 12: How to Pay — Financing and Negotiation
- **Heading:** "Paying for an Engine Repair: Shop Financing, Cards, and Negotiation Tactics"
- **JSON field:** `callout[2]`
- **Why it helps:** A $3,000-$8,000 repair is not a cash purchase for most readers. Shop financing (often 0% 6-12 months) vs. credit card vs. personal loan has real cost implications. This is the COMMONLY DROPPED item.
- **Arsenal move:** Decision tree (repair cost tier → best payment path); exact script for negotiating parts cost.
- **Data available:** No gov source — decision-level only.
- **What competitors miss:** Payment options are universally absent from engine repair cost pages. Some shops negotiate parts (especially on engine replacement — reman vs. used pull); none explain how.

### Section 13: Post-Repair — What to Watch and When to Go Back
- **Heading:** "The First 500 Miles After an Engine Repair"
- **JSON field:** `callout[3]`
- **Why it helps:** Post-repair failure is common (gaskets need re-torque, new seals need seating). Readers need to know what's normal, what's a warranty claim, and when to return. This is the COMMONLY DROPPED item.
- **Arsenal move:** Checklist (normal break-in signs vs. red flags that require immediate return).
- **Data available:** No gov source — standard practice.
- **What competitors miss:** Nobody covers post-repair at all. A reader who ignores oil seepage in the first week on a rebuilt engine destroys a $4,000 repair.

---

## Universal checklist audit

- **a. DIY vs pro threshold** → Section: "Engine Repairs You Can DIY and the Ones You Shouldn't Touch" (diySection[0])
- **b. Quality spectrum** → Section: "Dealership vs. Independent vs. DIY" (reference[3]) + parts tier in reference[0]
- **c. Scope decoder** → Section: "The Four Variables That Move Your Estimate" (reference[0]) + "Four Charges That Appear After the Estimate" (hiddenCosts)
- **d. Cost of delay** → Section: "Four Engine Problems That Double in Cost If You Drive Another Week" (callout[0])
- **e. Insurance/warranty** → Section: "When Your Warranty or Extended Coverage Pays for the Repair" (callout[1]) [ADDRESSED — commonly dropped]
- **f. Code/permit** → N/A: engine repair is a service trade, no permit required
- **g. Questions to ask** → Section: "Six Questions That Protect You at the Service Counter" (reference[4])
- **h. Where money goes** → Section: "How the Calculator's Inputs Drive Your Number" (reference[0]) + repair type breakdown (reference[1])
- **i. Lifespan/repair-vs-replace** → Section: "When the Repair Bill Exceeds the Car's Value" (reference[2]) + repairVsReplaceSignal output
- **j. Post-completion** → Section: "The First 500 Miles After an Engine Repair" (callout[3]) [ADDRESSED — commonly dropped]
- **k. Regional variation** → Section: "Engine Repair Rates by Region" (reference[5])
- **l. How to pay** → Section: "Paying for an Engine Repair" (callout[2]) [ADDRESSED — commonly dropped]

---

## FAQ plan

1. **How much does engine repair cost on average?** (FAQ[0] — contains "cost", "average", "how much") — covers full range by repair type: minor repairs $200-$600, head gasket $1,200-$3,000, timing belt/chain $400-$1,500, rebuild $2,500-$6,000, replacement $3,000-$10,000+. Point to the calculator for their specific inputs.

2. **Is it cheaper to rebuild or replace an engine?** — covers the rebuild vs. replace math: rebuild preserves original engine (correct for low-mileage or specialty engines), replace with reman often wins on warranty (most remans carry 3yr/100k). Rule of thumb: if rebuild cost > 120% of a reman, buy the reman.

3. **How much does a head gasket repair cost?** — specific high-volume query. $1,200-$3,000 depending on engine configuration, whether head is warped (add $200-$500 for machining), and shop type. An overheated engine with a blown head gasket often has secondary damage — always ask for a full teardown assessment before authorizing.

4. **What is the average labor rate for engine repair?** — BLS OES regional median $100-$130/hr nationally; dealerships average $130-$175/hr; independent shops $85-$120/hr. Flat-rate hours (book time) determine total labor charge, not actual time spent.

5. **How do I know if my engine is worth fixing?** — the 50-75% rule: if repair cost exceeds 50% of the vehicle's current market value, weigh replacement seriously; above 75%, replacement wins financially in almost every scenario unless the vehicle is a classic or has sentimental value.

6. **What does a complete engine replacement cost?** — new crate engine $4,000-$10,000 installed; remanufactured $2,500-$6,000 installed; used pull $1,500-$4,000 installed. Reman carries the best warranty-to-cost ratio for daily drivers.

7. **Can I negotiate engine repair costs?** — yes, but on parts, not labor. Shops mark up parts 20-50%. Ask for aftermarket or reman on non-critical components. On engine replacement, asking for a used pull instead of reman can save $800-$2,000; ask about the warranty difference before deciding.

8. **What voids an engine repair warranty?** — running the car with low oil or overheating after the repair, using non-specified fluids, or modifying the engine. Get the warranty terms in writing before the repair begins; ask specifically what voids coverage.

9. **Does car insurance cover engine repair?** — standard auto insurance does not cover mechanical breakdown. Mechanical breakdown insurance (available from some insurers) and extended warranties do. If the engine failure was caused by a covered accident, collision/comprehensive may apply — call your insurer before authorizing teardown.

---

## What no competitor covers

1. **Interference engine risk for DIY timing repairs.** On an interference engine, a timing belt or chain slip destroys pistons and valves instantly. No competitor tells readers to check this before touching the timing system. We name it in diySection with the instruction to verify before proceeding.

2. **Pre-authorization requirement for extended warranties.** Extended warranties require authorization before teardown begins. A reader who lets the shop start work without calling their warranty company loses the claim entirely. This is a $3,000-$8,000 mistake that one sentence prevents.

3. **Flat-rate hours as a quote auditing tool.** Shops bill by flat-rate book hours, not actual hours. A reader who asks "what's the book time?" can detect labor padding immediately. No competitor explains flat-rate billing or arms readers to audit it.

4. **Post-repair break-in protocol.** The first 500 miles after a rebuild or replacement are when failure is most likely — gaskets seating, seals seating, oil passages clearing. Readers who know what's normal (minor seepage, slight smoke on first start) vs. what requires an immediate return (heavy smoke, oil pressure warning, coolant loss) protect a major investment. No competitor covers post-repair at all.
