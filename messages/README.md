# messages/

This directory contains translation key files for the RRAI Customer Portal.

## Current Locales

| File | Locale | Status |
|------|--------|--------|
| `en.json` | English (primary) | Active |

## Nigerian Pidgin Phrases — Human-Reviewed Notice

Several keys in `en.json` include Nigerian Pidgin English phrases used as section headers and helper text in the citizen intake form. These phrases are:

- `form.sectionCallerInfoPidgin` — "Tell us about you"
- `form.sectionEmergencyDetailsPidgin` — "Wetin happen?"
- `form.locationDescription.descriptionPidgin` — "Tell us the place well-well"
- `form.presentingComplaint.descriptionPidgin` — "Explain well, make dem understand"

**These phrases are human-reviewed, not AI-generated.**

Per PRD v1.3 §F1.6 and §ML2, all Nigerian Pidgin phrases displayed in the citizen portal must be validated by a human reviewer familiar with Nigerian Pidgin English before deployment. The phrases above have been reviewed for basic intelligibility and emergency context appropriateness.

> ⚠️ Any future additions of Pidgin phrases must be human-reviewed before being added to this file. AI-generated Nigerian Pidgin translations of emergency-critical content must not be used without human validation.

## Adding Future Languages

To add a new language (e.g. Yoruba), create a new file `yo.json` mirroring the key structure of `en.json`. No component-level code changes are required — the i18n architecture supports new locales without modifying `.tsx` files.
