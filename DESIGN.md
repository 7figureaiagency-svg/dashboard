# Nextgn Realtors — Obsidian Luxury PropTech Design System
Generated via Google Stitch MCP (`projects/4915451202441094819`)

## Brand & Style
This design system crafts a high-performance, distraction-free CRM and lead management experience for ultra-high-net-worth real estate operations. Drawing inspiration from the mechanical precision of Linear and the financial polish of Stripe, it pairs institutional authority with the bespoke elegance of modern luxury brokerage.

The aesthetic marries deep obsidian slate framing with crisp, hyper-structured white cards, micro-borders, and tactile elevation. The interface evokes speed, operational focus, and uncompromised discretion. Hot buyer signals, high-velocity deals, and priority interventions demand immediate visual instinct without jarring the broker's focus, achieved through restrained champagne amber and emerald accents against a hyper-refined canvas.

## Colors & Surface Hierarchy
The system relies on a high-contrast hybrid light canvas anchored by rich obsidian slate structural containers.

- **Primary Canvas**: `#F8FAFC` (`oklch(0.985 0.003 240)`) — soft, glare-reducing off-slate.
- **Surface Elevation**: Cards, modals, drawers, and active data rows rest on stark `#FFFFFF` surfaces with subtle interior rim borders (`rgba(15, 23, 42, 0.06)`).
- **Primary Typography & Nav**: Deep obsidian slate (`#0F172A`, `#1E293B`, `#334155`).
- **Champagne Amber Accents**: (`#D97706` / `#F59E0B`, tinted to `#FEF3C7` for badges) — reserved exclusively for high-priority leads, approaching follow-up deadlines, and hot prospects.
- **Emerald Mint Accents**: (`#10B981` / `#059669`, tinted to `#ECFDF5`) — designates confirmed site visits, signed agreements, and successful deals.
- **Secondary Metadata**: Subdued cool slate (`#64748B` and `#94A3B8`) for timestamps, property unit metadata, and baseline statuses.

## Typography
- **Headlines & Metrics**: `Plus Jakarta Sans` (Weights: 600, 700). High-contrast structural weight for metrics, pipeline headers, and modal titles.
- **Body & Transactional Data**: `Inter` (Weights: 400, 500, 600). Neutral clarity for CRM logs and data-dense lead attributes.
- **Monetary & Date Tabular Figures**: All currency figures (crores ₹ Cr, lakhs ₹ L), dates, and timestamps render with tabular numbers (`tnum`) for razor-sharp column alignments.

## Elevation & Depth
Depth is constructed through ambient, low-spread directional drop shadows paired with delicate micro-borders:
- **Level 0 (Base Canvas)**: `#F8FAFC` flat canvas.
- **Level 1 (Cards & Panels)**: `#FFFFFF` with `1px solid #E2E8F0` and `shadow-[0_1px_2px_rgba(15,23,42,0.04)]`.
- **Level 2 (Interactive Rows & Hover)**: `shadow-[0_4px_6px_-1px_rgba(15,23,42,0.06)]` with border transition.
- **Level 3 (Dropdowns & Popovers)**: `#FFFFFF` with `shadow-[0_10px_15px_-3px_rgba(15,23,42,0.08)]`.
- **Level 4 (Lead Drawers & Modals)**: `#FFFFFF` with obsidian backdrop wash (`rgba(15, 23, 42, 0.60)` with `backdrop-blur-sm`).

## Shapes & Radii
- **Base Components**: Input fields, buttons, lead cards use `rounded-md` (8px / `0.5rem`).
- **Panels & Containers**: `rounded-lg` (12px - 16px).
- **Status Pills**: Full pill radius (`rounded-full` / `9999px`) with dot-indicator.

## Components Specification
- **Primary Button**: Solid `#0F172A`, text `#FFFFFF`, height 36px, `rounded-md`.
- **Accent Button (Hot Leads / Urgent)**: Solid `#D97706`, text `#FFFFFF`.
- **Outline Button**: `#FFFFFF`, `1px solid #E2E8F0`, text `#1E293B`.
- **Status Badges**:
  - Hot / Action Needed: Background `#FEF3C7`, text `#92400E`, dot pulse.
  - Site Visit Confirmed / Deal Won: Background `#ECFDF5`, text `#065F46`, emerald dot.
  - In Qualifying: Background `#F0F9FF`, text `#0369A1`, sky dot.
  - Baseline / Draft: Background `#F1F5F9`, text `#475569`, slate dot.
- **Quick Action Bar**: Sticky action buttons (`📞 Call`, `💬 WhatsApp`, `📅 Book Visit`) in Lead Drawer.
