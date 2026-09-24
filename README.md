# Property Hub Pro

Build a complete Real Estate CRM & Inventory Admin Panel from scratch connected to Supabase using React, Tailwind CSS, Lucide Icons, and Shadcn UI components. Designed for non-technical users in English only, with DB load optimization (30-second polling interval/listeners).

### 1. SUPABASE INTEGRATION & SETUP
- **Base URL:** `https://rooimpeiyxhxkfnqkyay.supabase.co`
- **Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwY3NjcXRldWJ4Y2JweGlydHNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4MzEyNTksImV4cCI6MjEwMzQwNzI1OX0.3tapRYinsCrZbNe0kPFViBspAYAERVnXVB6cxozn8LQ`
- Initialize `@supabase/supabase-js` client.

### 2. DATABASE SCHEMA
- **`inventory` Table:**
  - `property_id` (PK, UUID/Int)
  - `project_name` (Text)
  - `property_category` (Enum: FLAT, VILLA, COMMERCIAL, PLOT)
  - `configuration` (Enum: 1BHK, 2BHK, 3BHK, 4BHK, 5BHK, SHOP, OFFICE, PLOT)
  - `location` (Text)
  - `price` (Int)
  - `area_sqft` (Int)
  - `status` (Enum: AVAILABLE, SOLD, HOLD)
  - `stock_type` (Enum: REGULAR, CLEARANCE)
  - `brochure_url` (Text)
  - `map_url` (Text)
  - `assigned_executive_name` (Text)
  - `assigned_executive_telegram_id` (Text)
  - `assigned_executive_phone` (Text)

- **`leads` Table:**
  - `lead_id` (PK, UUID/Int)
  - `name` (Text), `phone` (Text), `requirement` (Text), `property_type` (Text), `location` (Text), `budget` (Int), `purpose` (Text), `timeline` (Text)
  - `status` (Enum: NEW, QUALIFYING, QUALIFIED, SITE_VISIT_BOOKED, VISIT_DONE, NOT_INTERESTED)
  - `property_state` (Enum: NO_PROPERTY_SEARCHED, PROPERTY_OPTIONS_SENT, PROPERTY_SELECTED, SITE_VISIT_INTENT, SITE_VISIT_BOOKED, HUMAN_HANDOVER, NO_MATCHING_PROPERTY)
  - `selected_property_id` (FK), `selected_property_name` (Text), `selected_property_price` (Int), `selected_property_brochure_url` (Text), `selected_property_map_url` (Text)
  - `site_visit_datetime` (Timestamp/String), `rejection_reason` (Text), `summary` (Text), `source` (Text)
  - `assigned_executive_name` (Text), `assigned_executive_telegram_id` (Text), `assigned_executive_phone` (Text)
  - `alert_sent_at` (Timestamp), `first_human_contact_at` (Timestamp), `followup_count` (Int), `last_followup_at` (Timestamp), `created_at` (Timestamp)

### 3. HUMAN-READABLE UI BADGE MAPPINGS
- **`property_state` Badges:**
  - `NO_PROPERTY_SEARCHED` -> "Requirements Pending" (Gray)
  - `PROPERTY_OPTIONS_SENT` -> "Options Shared" (Blue)
  - `PROPERTY_SELECTED` -> "Property Selected" (Purple)
  - `SITE_VISIT_INTENT` -> "Visit Requested" (Yellow)
  - `SITE_VISIT_BOOKED` -> "Site Visit Scheduled" (Green)
  - `HUMAN_HANDOVER` -> "Action Required" (Red, Animated Pulse)
  - `NO_MATCHING_PROPERTY` -> "No Match Found" (Orange)
- **`status` Badges:**
  - `NEW` -> "Fresh Lead" (Gray)
  - `QUALIFYING` -> "In Conversation" (Blue)
  - `QUALIFIED` -> "Qualified Prospect" (Indigo)
  - `SITE_VISIT_BOOKED` -> "Hot Lead" (Green)
  - `VISIT_DONE` -> "Visit Completed" (Teal)
  - `NOT_INTERESTED` -> "Closed/Dropped" (Muted Gray)

### 4. DASHBOARD TABS & FEATURES

**Global Header & Filters:**
- Global Date Selector: Quick Filter (Today, Tomorrow, All Time) filtering lead timestamps (`created_at`).

**TAB 1: LEADS CRM TABLE & OPERATIONAL WORKFLOWS**
- **Filters Bar:** Executive Name, Lead Status, Source, Date Range.
- **Main Table Columns:** Customer Name, Phone, Status & Property Badges, Selected Property Name, Budget ($/₹), Created Date, Actions.
- **Primary Actions:**
  - "Call Now" Button (`tel:${phone}`).
  - Expandable Detail Drawer/Modal per lead containing the full conversation `summary` and 6 operational workflows:
- **6 Core Operational Workflows (Lead Mutations):**
  1. *Mark Contacted / Takeover Chat CTA:* Set `first_human_contact_at` = current timestamp, `property_state` = 'HUMAN_HANDOVER'. Updates UI to green "In Human Handover" badge.
  2. *Call Not Answered CTA:* Set `followup_count` = 0, `last_followup_at` = current timestamp. Shows inline status indicator "Follow-up counter reset for tomorrow's drip".
  3. *Manual Site Visit Booking:* DatePicker + TimePicker input + "Confirm Visit" button. Updates `site_visit_datetime` = selected input, `status` = 'SITE_VISIT_BOOKED', `property_state` = 'SITE_VISIT_BOOKED'. Shows "Visit Scheduled" badge with timestamp.
  4. *Inline Profile Editing:* Allow direct editing and saving for `budget`, `location`, `property_type`, `requirement`, `purpose`, and `timeline` back to the `leads` table.
  5. *Site Visit Done CTA:* Sets `status` = 'VISIT_DONE'. Shows "Visit Completed" badge and unlocks post-visit view.
  6. *Drop Lead / Mark Junk Button:* Displays confirmation modal ("Are you sure you want to drop this lead?"). On confirm, sets `status` = 'NOT_INTERESTED', moves card to dropped status, and mutes further actions.

**TAB 2: BUDGET & PROPERTY VIEWS**
- **Budget Tiers Grid:** Luxury (>60L / >$600k), Middle (25L-60L), Lower (<25L). Displays matching leads inside tiered cards with "Call Now" CTA & collapsible `summary`.
- **Property Breakdown:** Group leads visually by `selected_property_name` along with live site visit counts.

**TAB 3: SALES TEAM PERFORMANCE & SLA TRACKER**
- **Top KPI Bar:** Total Leads, Site Visits Booked, Pending Handovers, Unattended Hot Alerts (Counter of leads >30 min delay highlighted in Red).
- **Executive SLA Leaderboard Table:**
  - Columns: Executive Name | Assigned Leads | Visits Booked | Pending Handovers | Avg Response Time (Mins).
  - SLA Avg Formula: Difference between `first_human_contact_at` and `alert_sent_at` in minutes.
  - Speedometer Badges: Green (<15m), Yellow (15-30m), Red (>30m or Uncontacted).

**TAB 4: INVENTORY CRUD MANAGEMENT**
- Minimal Property Grid/Cards displaying full property attributes with direct **Edit** & **Delete** options.
- **Add / Edit Property Form Rules:**
  - Dropdowns Only: Category (FLAT/VILLA/COMMERCIAL/PLOT), Configuration (1BHK-5BHK/SHOP/OFFICE/PLOT), Status (AVAILABLE/SOLD/HOLD).
  - Numeric Inputs Only: Price & Area (Automatically strip ₹, $, and commas prior to database submission).
  - Direct Brochure Uploader: PDF upload component uploading directly to Supabase storage bucket `property-brochures`, saving the public URL into `brochure_url`.
  - Maps URL: Text input field with URL validation.
  - Mandatory Executive Details: Executive Name, Telegram ID, and Phone Number.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://nextgnrealtors.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/980275ca-f1bf-4165-bce1-744143bd0539).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
