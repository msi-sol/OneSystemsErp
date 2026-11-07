# OneSystemsERP — BOQ to Issuance: Step-by-Step Guide for New Users

This guide walks you through the **whole project flow** in the website, one screen at a time, in the same order as the workflow chart from the meeting:

```
Upload BOQ → AI reads it → Review & approve BOQ → Work packages → Approve packages
→ Upload procurement benchmark → AI matches it → Approve benchmark → Master material list
→ Material request → Supplier canvassing → Purchase order → Receive deliveries
→ Warehouse / site stock → Material issuance
```

For every step you will find:

- **What it is for** — why this step exists, in plain words.
- **Where** — which page or menu.
- **Do this** — the exact buttons and fields.
- **You should see** — how to know it worked.
- **Watch out** — common mistakes.

> **Test files used in this guide** (all in your *Downloads* folder):
> - BOQ: `awarded-boq-sample-pgh.xlsx` (the PGH awarded Bill of Quantities, 326 items, ₱43,106,674.89)
> - Benchmark: `PROCUREMENT-BENCHMARK-Sample.xlsx` (the PGH procurement budget)
> - Optional DUPA: `DUPA_Concrete_10m3_Source_Adapted.xlsx`
>
> You can follow the same steps with your own files.

---

## Key words (read once)

| Word | Meaning |
|---|---|
| **BOQ** (Bill of Quantities) | The contract list of work items: description, unit, quantity, rate and amount. Its total is the **contract value**. |
| **BOQ baseline** | The approved, locked version of the BOQ. Everything after this step is checked against it. |
| **Section** | A heading group inside the BOQ (e.g. "AIR CONDITIONING – VRV SYSTEM A"). |
| **Work package (WP)** | A chunk of the project that is planned and executed together (dates, location, budget). Built from BOQ sections. |
| **DUPA** | Detailed Unit Price Analysis — a breakdown of a package's cost into materials, labor and equipment. Optional. |
| **Procurement benchmark** | Your **spending budget** per item (what you are allowed to buy for). It is separate from the contract value. |
| **Master material list** | The combined list of all materials to buy, made from the approved benchmark, with the allowed quantity of each. |
| **MR / MRF** | Material Request (Form) — a request from site to buy materials for a package. |
| **Canvass** | Collecting supplier quotations for an approved MR and choosing the best one. |
| **PO** | Purchase Order sent to the chosen supplier. |
| **DR** | Delivery Receipt — what the supplier delivered against a PO. |
| **Issuance (MIS)** | Releasing materials from stock to the people doing the work. |

---

## Step 0 — Sign in and pick your project context

**What it is for:** Everything you do is recorded under your account and checked against your role (who may create, review or approve).

**Where:** `http://localhost:3001/login`

**Do this**
1. Open the login page. On your local computer the **Email Address** and **Password** are already filled in for the demo account (`admin@demo.com`).
2. Click **Sign In**.

**You should see:** The dashboard, with **Local Demo Director · SUPER ADMIN** at the bottom-left of the sidebar.

**Watch out**
- The header has an **ACTIVE PROJECT WORKSPACE** drop-down. Several pages (Inventory stock, Material Issuance, creating a Material Request) only show the project selected there. After you create your project in Step 1, **select it in this drop-down**.
- The demo account is a SUPER ADMIN, so it can do every role's step (prepare, review and approve). In real use these are different people.

---

## Step 1 — Upload the BOQ (creates the project)

**What it is for:** The BOQ is the starting point of every project. Uploading it **creates the project** with its name and contract value, and stores the original file unchanged as evidence.

**Where:** Sidebar **BOQ Workspace** (`/boq`).

**Do this**
1. Under *Drop the BOQ document here* click **Choose file** and pick `awarded-boq-sample-pgh.xlsx`. (Excel, CSV, PDF, Word, text and photos up to 10 MB are accepted.)
2. Click **Analyze this workbook** (for a PDF or Word file the button says **Analyze this file**). Nothing is saved yet.

**You should see:** *STEP 4 OF 4 · Next: check the reading and save*, and below it:
- **New project details** — the **Project name** and **Signed contract value** read from the file, marked *"Read from the uploaded file"*.
- **Confirm BOQ source** — the sheet and how its columns were understood (Description, Unit, Quantity, Unit cost, Amount).
- **Review all BOQ items** — *Full BOQ total · 326 items · ₱43,106,674.89*, a section filter and the item table.

---

## Step 2 — AI extraction: check what was read

**What it is for:** Excel files with a normal layout are read directly. Unusual layouts, PDFs, Word files and photos are read with the **AI reading helper**. Either way, **you** confirm the result before it becomes a project.

**Do this**
1. Check the **Project name** and **Signed contract value**. If wrong, click the **pencil** next to it, correct it, and click the **check mark**. The note changes to *"Edited by you"*.
2. If the contract value and the BOQ total differ, a yellow box **"BOQ and contract amounts differ"** shows both and the difference. You may still save; the difference must be resolved before approval (Step 3).
3. Use **Filter by section** and **Previous / Next** to look through the items. *Used unit rate* vs *Source stated rate* shows where a rate was derived from the amount.
4. Open **Column evidence and mapping help** only if a column was mapped wrongly; change it in the mapping drop-downs and click **Update item preview**.
5. If a yellow box says **"A project named … already exists"**, saving would create a *second* project. Open the existing one instead, or rename this one.
6. Click **Confirm sheet & save draft**.

**You should see:** The project's BOQ page opens (`/projects/<id>/boq`) with a draft BOQ.

**Watch out:** Choose the new project in the header's **ACTIVE PROJECT WORKSPACE** drop-down now.

---

## Step 3 — Review, correct and approve the BOQ

**What it is for:** Before anything is planned or bought, the BOQ must be checked against the source file and the signed contract, reviewed by an engineer, and approved by the PM. Approval **locks** it as the **BOQ baseline**.

**Where:** The project's **BOQ** page. Tabs at the top: **Overview**, **Sections**, **BOQ items**, **Compare with file**, **Source file**, **History**. A guidance card always tells you the **next step** and has a button to it (e.g. *Review findings*, *Verify contract value*, *Record engineering review*, *Go to approval*). Open **BOQ review steps · N of 7 done** to see all steps.

**Optional — 🤖 AI Check (BOQ):** In the *AI Check · Optional* box click **Run AI Check**. The AI lists insights (e.g. wrong unit, item under the wrong system) and suggested corrections to description, unit, section or item code. For each suggestion you can edit the proposed value, then **Accept** or **Dismiss**. It never changes quantities, rates or amounts. Use it as a second pair of eyes; it is not required.

**Do this (in the "BOQ review and approval" panel)**
1. **Findings** (only if the reader raised any): each card describes something to check.
   - **Confirm as read** — the reading is correct.
   - **Set aside** — exclude that source row; type a **Reason** (at least 5 characters) first.
   - **Defer** — decide later (non-blocking findings only; needs a reason).
   - Use **Previous / Next** until it says *"Every finding has a decision."*
2. **Verify the signed contract value:** type a note in **Contract check or revision reason** (e.g. "Checked against signed contract") and click **Verify signed contract value**.
   - Totals match → *"Contract value verified. The BOQ and contract amounts reconcile."*
   - Totals differ → fix the items (**Review and correct BOQ items**), or click **Use BOQ total as proposed contract value**, then **Record contract revision**, then verify again.
3. If you set aside rows: tick **"I acknowledge the source rows intentionally set aside."** and fill the **Acknowledgement reason**.
4. **Engineering review:** type in **Engineering review comments** (at least 5 characters) and click **Record engineering review** → *"Engineering review recorded for the current BOQ."*
5. **PM approval:** optionally type a **PM approval note**, click **Approve BOQ baseline**, then **Confirm PM approval & lock**.

**You should see:** *"BOQ approved and locked."* and a card **BOQ baseline · version 1 · Approved · locked**, with **Download original file**, **Approval history** and **Open Work Packages**.

**Watch out:** *Approve* stays disabled until: totals match, contract verified, no open findings, and the engineering review is current. The guidance card tells you which one is missing.

---

## Step 4 — Work packages: suggest the packages

**What it is for:** The BOQ is split into **work packages** that the team will schedule, locate, budget and later request materials for. The system **suggests** packages by grouping related BOQ sections, and their values always add up to the BOQ total.

**Where:** Click **Open Work Packages** (or the project's **Work Packages** tab). The step buttons across the page are: **Packages → Scope → Dates & sequence → Locations & constraints → Resources & DUPA → Review & approve**. Each shows *(checks pass)* or *N to fix*.

**Who can edit:** the person who uploaded the BOQ, or users given a role under **Project WPS capacities** (Planner / Project Engineer / Project Manager). The demo account uploaded the BOQ, so it can do everything.

**Do this**
1. Click **Start work-package plan**.
2. In *Plan from the approved BOQ* click **Generate suggested work packages**, check the preview, then **Confirm suggested packages**.
   - Prefer your own split? Use **Add work package** (code, name, dates, weight → **Create work package**) and assign scope in **Scope**.
   - Not happy with the suggestion? **Start the package plan over → Clear all draft packages** and generate again.

**Optional — 🤖 AI Check (work packages):** **Run AI Check** suggests a better grouping of sections and which packages must finish before others start. You can rename packages and move sections, then **Accept this grouping → Confirm: replace N current packages**, and tick suggested **sequence links → Add selected links**.

**You should see:** *"Plan updated."*, a package list (e.g. WP-01 …), and **Plan at a glance**: *Package values vs BOQ total — Matches the BOQ total*, *Completion weights 100%*.

---

## Step 5 — Work packages: dates, locations, allowances, then approve

**What it is for:** A package can only be executed when it has **dates**, a **location**, and reviewed **budget allowances** (materials, labor, equipment). Then an engineer reviews it and the PM approves the **work-package baseline (BL-001)**.

**Do this**
1. **Dates** — in *Fill missing package dates* set **Project start** and click **Apply suggested dates**. (Individual dates: **Dates & sequence → Edit dates**.)
2. **Locations** — open **Locations & constraints**:
   - Under *Project locations* type a **Location name** (e.g. "3rd Floor OR, Central Block") and click **Add location**.
   - In *Assign a location to all unlocated scope* choose it in **Location for unlocated scope** and click **Assign to N lines**.
   - Constraints are optional; if you add one, give it an owner and a needed-by date.
3. **Allowances** — open **Resources & DUPA**: on every package row (*System suggestions unreviewed*) click **Confirm allowances** → *"Allowances reviewed and accepted."* (If a package has none: **Review allowance creation → Create BOQ budget allowances**, then confirm.)
4. **Optional DUPA** — open a package → **DUPA** tab → choose the DUPA file → **Analyze package breakdown** → check rows → **Preserve reviewed breakdown**. Categories are pre-filled from its Materials / Labor / Equipment headings. A note compares the **DUPA total with the package BOQ value**. To use it as the budget: tick the suggested allowances it replaces, type the **Reason**, tick the acknowledgement, and click **Add reviewed component rows to draft resources**.
5. **Review & approve** — all readiness checks must say *Passed* (BOQ reconciles, weights 100%, allowances set and reviewed, dates set, locations set…).
   - **Engineering review comments** → **Record engineering review**.
   - **PM approval reason (5–300 characters)** → **Approve work-package baseline** → **Confirm PM approval & lock**.

**You should see:** *Approved baseline · BL-001* and the link **Open procurement benchmark review →**.

**Watch out:** Changing an approved plan later needs **Start plan revision** (with a reason); the old baseline stays active until the revision is approved.

---

## Step 6 — Upload the procurement benchmark

**What it is for:** The benchmark is your **allowed spending budget** per item. It is kept separate from the contract (BOQ) value. Purchases are later compared with it.

**Where:** **Open procurement benchmark review →** (or the project's **Procurement Benchmark** tab, `/projects/<id>/benchmark`).

**Do this**
1. In **Benchmark file** choose `PROCUREMENT-BENCHMARK-Sample.xlsx` and click **Analyze file**.
2. Check the **Sheet**, **Header row** and column mapping (Item Code, Description, Unit, Quantity, Unit Cost, Amount).
3. If a row is reported with *"amount is required"* (a heading or service line without a price, e.g. *Security Guards*), tick **Review source row N as non-priced scope**, type a **Reason**, then click **Refresh preview with mapping**.
4. Click **Save analyzed benchmark** → *"Source saved and benchmark review refreshed."*

**You should see:** *Procurement benchmark · DRAFT*, the source record with **Download source**, the totals (*Benchmark line total*, *BOQ contract baseline*, *Benchmark minus contract*), and a list of what still needs fixing (*Approval needs …*).

---

## Step 7 — AI-match the benchmark to the BOQ and packages

**What it is for:** Each budget line must be tied to the **BOQ item** it pays for, the **work package** it belongs to, and a **resource kind** (Material / Labor / Equipment / Other). Doing that by hand for hundreds of rows is slow, so the AI suggests it.

**Do this**
1. Click **Suggest BOQ matches** (takes up to about a minute for 300+ rows).
2. Read the message, e.g. *"Suggestions applied … (326 row(s) updated)"*. It may also say *"N rate(s) differed from their amount only by display rounding and now use the precise rate"* — the stated amounts never change.

**You should see:** The *Approval needs …* message shrinks or disappears.

---

## Step 8 — Review, correct and approve the benchmark

**What it is for:** The AI only *suggests*. You confirm every mapping before the budget becomes binding.

**Do this**
1. Page through the rows (**Previous rows / Next rows**, 25 per page). Each row has **Resource kind**, **BOQ item / additional scope**, **Package**, **Reason for additional row** and a **Rate check**.
2. Fix anything wrong and click **Save line edits**.
3. Rows not in the BOQ (*Additional / unmatched*) need a reason and the tick **Approver acknowledges additional row**.
4. Click **Approve benchmark** → *"Benchmark approved."*

**Watch out:** *Approve* stays disabled while any row is unclassified, has no package, has a quantity × rate ≠ amount, or an unacknowledged additional row. Small rounding differences are highlighted, not hidden.

---

## Step 9 — Generate the master material list

**What it is for:** One combined list of **materials to buy**, with the **total allowed quantity** of each across all packages (e.g. 100 hollow blocks in one section + 200 in another = **300**), still remembering which package each part belongs to. Labor, equipment and other lines stay as budget only.

**Do this**
1. On the benchmark page click **Generate master materials output** → *"Master materials output generated."*
2. Click **Open master materials →** (the project's **Master Materials List** tab).

**You should see:**
- **Master material limits** — per material: approved quantity, reserved by MRFs, available quantity, approved budget, committed PO cost, available budget, limit status.
- The master table — item code (BM-0001…), description, unit, quantity, unit cost, value and **GRAND TOTAL**.

**Watch out:** Generation happens once per approved benchmark; changes later go through revisions.

---

## Step 10 — Material Request (MR)

**What it is for:** The site asks for materials for a specific work package. The system only lets you request up to the **remaining allowance** from the master material list, so nobody can over-order.

**Where:** Sidebar **Procurement → Material Requests → Create**, or open `/material-requests/create` (it uses the project chosen in the header's ACTIVE PROJECT WORKSPACE).

**Do this**
1. **Work package** — choose the package the materials are for. Each one shows its code, e.g. `WP-07 · I-A. AIR CONDITIONING- VRV SYSTEM A`.
2. Below it you now see:
   - **Master material limits** for this package's materials (approved quantity, reserved by other MRs, available quantity, budget).
   - A table of the package's materials with **Allowance**, **Issued**, **Pending requests**, **Open POs**, **Remaining shortage**.
3. Type a number in **Request quantity** for each material you need (not more than *Remaining shortage*). Example: ACCU 18HP → `3`, FCU 2HP → `2`.
4. Fill **Purpose**, **Date needed** and **Location of use**.
5. Click **Create package material request**.

**You should see:** The MR page in **DRAFT** with the hint *"Next: run the AI check. The 'Submit for Review' button appears once it finishes."*

**Then take it through approval (on the MR page):**

| Button | Who normally does it | What it means |
|---|---|---|
| **🤖 Run AI Check** | Materials engineer | AI checks the quantities against the BOQ balance and looks for duplicates. Shows *"AI Validation System – Risk Level: LOW"* when fine. The MR gets its real number (e.g. MR-2026-0001). |
| **📤 Submit for Review** | Materials engineer | Sends it to Cost Control. **From this moment the quantity is reserved** (others can no longer request it). |
| **🔍 Mark as Checked (Cost Control)** | Cost control | Confirms the budget side. Status FOR REVIEW. |
| **✅ Approve MRF** | Project manager | Final approval. Status APPROVED. |

**Watch out**
- If you type more than the remaining allowance, you get: *"A requested quantity is more than the remaining allowance for this package…"* — lower the quantity.
- **Cancel request** asks you to confirm (**Confirm: cancel this request**). Cancelling **releases the reserved quantity** back to the allowance.

---

## Step 11 — Supplier Canvassing

**What it is for:** Get prices from suppliers for the approved MR, **compare them with the approved benchmark (budget)** and choose the best offer.

**Where:** On the approved MR page, under *Related Canvass Forms*, click **Start canvassing for this request →** (or Procurement → Canvassing).

**Do this**
1. The canvass opens (e.g. **CANV-2026-0001**, status DRAFT). The **Canvassed Items** tab lists each item with its **Benchmark rate** and **Benchmark amount** — your budget.
2. Open the **Supplier Quotations** tab → **+ Encode Quotation**.
   - Choose the supplier in **Select Supplier…** (add suppliers first in Procurement → Vendors & Suppliers if the list is empty).
   - For each item, **Available Qty** (how many the supplier can supply) and **Unit Cost (₱)**. Under each item name you see its *Benchmark rate* as a guide.
   - Click **Submit Quotation**. Repeat for every supplier (2 or more is recommended).
3. Each quotation card now shows **"Vs benchmark (₱…): ₱… under/over (±%)"**. Lines above the budget are listed as *"Above benchmark rate: …"*.
4. Open **🤖 AI Tabulation & Summary** → **🤖 Generate AI Comparison & Summary**. The AI ranks the suppliers (60% price, 20% delivery, 20% payment terms) and recommends one.
5. Click **✍️ Endorse**, then **✅ Approve** (the recommendation).
6. Click **📄 Generate PO**.

**You should see:** Messages on the page such as *"AI recommendation endorsed."*, *"AI recommendation approved."*, then the new purchase order opens.

**Watch out**
- A quote **above** the benchmark is allowed but clearly flagged. The approval rule for over-budget quotes is still to be decided by management; check before approving.
- After the recommendation is approved, quotations are locked.

---

## Step 12 — Purchase Order (PO)

**What it is for:** The official order to the supplier, linked to the MR, the canvass and the project/package.

**Where:** Opens automatically after *Generate PO* (or Procurement → Purchase Orders).

**Do this**
1. Check the PO (e.g. **PO-2026-0001**): supplier, *Reference Documents* (Material Request, Project, Canvass Form), items, quantities, unit cost and **GRAND TOTAL**.
2. Choose one:
   - **Submit PO for Review** → then **✅ Approve PO** (approver). Status **APPROVED**.
   - **↩ Return to canvassing** — if the price is too high or you want more quotes. Type the **Reason for further canvassing** (it is kept in the audit trail) and click **↩ Confirm return to canvassing**. The PO is set aside and the canvass reopens (status RETURNED) with a banner showing your reason; add or edit quotations, run the comparison again, **Endorse**, **Approve**, **Generate PO**.
   - **❌ Reject PO** (while under review) returns it to draft.
3. **Print PO** prints the order.

**You should see:** Status **APPROVED** and a new button **Receive delivery →**.

**Watch out:** Only draft or under-review POs can be returned to canvassing. An approved PO already counts against the budget.

---

## Step 13 — Receive Deliveries against the PO

**What it is for:** Record what the supplier **actually delivered**. Deliveries can come in several batches (partial / staggered). Stock and costs are posted only when the delivery is **approved**.

**Where:** On the approved PO, click **Receive delivery →** (the PO is pre-selected), or Deliveries → New.

**Do this**
1. **Select Purchase Order** — already selected.
2. **Delivery Receipt (DR) Number** — e.g. `DR-0001`.
3. **Upload DR Document (For AI Validation)** — upload the scanned/photographed delivery receipt; the AI compares it with what you encode. If you have no scan yet, tick **Cannot upload document right now** and type a **reason**.
4. The table shows each item's **Ordered Qty** and **Remaining**. For each delivered item type **DR Qty** (what the receipt says) and **Actual Qty** (what you counted). Add **Remarks** if something is lacking or damaged.
5. Click **Receive Delivery**.
6. On the delivery page (status **FOR ACCOUNTANT APPROVAL**) check the table: **Ordered**, **Received before**, **Outstanding**, **DR Qty**, **Actual Qty**.
7. The accountant clicks **✓ Approve Delivery** → **✓ Confirm approval**.

**You should see:** Status **APPROVED** (or *APPROVED (LACKING DOCUMENTS)* if no DR scan yet — you can still **Upload & Validate Document** later). The PO becomes **PARTIALLY_DELIVERED** until everything arrives, then **DELIVERED**.

**Partial delivery example:** PO for 4 units → first DR with 2 → PO *partially delivered* → second DR: the form shows *Remaining 2* → receive 2 → PO *delivered*.

**Watch out**
- If you encode more than the outstanding quantity, a yellow warning says *"This receipt is more than the PO's outstanding quantity…"*. Check with the supplier.
- Wrong entry? Click **Reject delivery**, type a reason (e.g. "wrong quantity encoded") and **Confirm rejection**. Nothing was posted to stock yet; then encode it again correctly.

---

## Step 14 — Warehouse / Project Site Stock

**What it is for:** See how much material is on hand for the project, and move stock from a central warehouse to the site.

**Where**
- **Inventory → Site Stocks & Materials** (`/inventory/stocks`) — shows the project in the header's ACTIVE PROJECT WORKSPACE (the page says which).
- Per package: **Work Packages → open a package → Materials and procurement** section.

**Do this**
1. In *Site Stocks & Materials* check each material: **Approved Quantity**, **Delivered Qty**, **Consumed / Issued**, **Stock on Hand**. Use **Show In-Stock Only** to hide empty lines.
2. In the package's *Materials and procurement* table check **Required**, **Reserved for package**, **Project unreserved**, **Warehouse unreserved**, **Incoming requests / POs / transfers**, **Shortage**.
3. **Central warehouse → site (optional):** in the package's inventory panel
   - create a warehouse (e.g. *Central Warehouse*),
   - link the project material to the warehouse catalog,
   - record the warehouse stock with a **stock adjustment** (reason + evidence reference) and have it **approved**,
   - create a **transfer** to the site (quantity + reference) → **Dispatch** → **Receive**.

**You should see:** After *Dispatch* the warehouse goes down and the site shows *Incoming transfers*; after *Receive* the site stock goes up and the quantity is reserved for that package.

---

## Step 15 — Material Issuance

**What it is for:** Release materials from stock to the foreman/engineer who will use them. This is what reduces *Stock on Hand*.

**Where:** Sidebar **Material Issuance** (uses the project in the header's ACTIVE PROJECT WORKSPACE).

**Do this**
1. Click **+ New Issuance Slip**.
2. **Project Reference** — already selected when only one project is active.
3. **Requested By** — the person receiving the materials.
4. **Activity / Purpose** — e.g. "Install ACCU units, VRF System A".
5. **Item Requisition List** — choose the material (each option shows how many are in stock, e.g. *ACCU- 18HP … · 3 units in stock*) and the **Req. Qty** (cannot be more than in stock). **+ Add Row** for more items.
6. Click **Submit Issuance Slip**. The slip (e.g. **MIS-2026-0001**) is **PENDING**.
7. Open it with **View Details** → **Process & Prepare Materials** (storekeeper prepares) → status **PROCESSED**.
8. **View Details** again → **Approve & Release Slip** → status **RELEASED**.

**You should see:** In *Site Stocks & Materials* the item's **Consumed / Issued** goes up and **Stock on Hand** goes down (e.g. delivered 3, issued 2 → on hand 1).

---

## Quick checklist (tick as you go)

- [ ] Signed in, project selected in ACTIVE PROJECT WORKSPACE
- [ ] BOQ uploaded, AI/reader result checked, draft saved
- [ ] BOQ reviewed and approved (baseline locked)
- [ ] Work packages suggested, checked and approved (BL-001)
- [ ] Benchmark uploaded, matched, problems fixed, approved
- [ ] Master material list generated
- [ ] Material request created → AI check → submitted → checked → approved
- [ ] Canvass: quotations encoded, compared with benchmark, endorsed, approved
- [ ] PO generated → submitted → approved (or returned to canvassing)
- [ ] Delivery received (try a partial one) → approved
- [ ] Stock on hand checked (optional warehouse transfer)
- [ ] Issuance slip → processed → released, stock reduced
