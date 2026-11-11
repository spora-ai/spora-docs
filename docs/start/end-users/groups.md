---
title: Groups
description: Share agents and settings with a team — a group has its own name, information block, locations and LLM drivers.
---

# Groups

A **group** is a shared principal: a set of agents that belong to an organisation rather than to one person, with its own name, its own agents and its own settings.

Every member of a group can read the group's pages. The group's **owner** and **admins** can change them.

## Finding a group

Open **Groups** in the sidebar — the page lists the groups you belong to, with the member count and the agent count of each. **Admin overview** lists every group in the installation, including the ones you are not a member of.

**Create group** makes a new group; you become its owner.

## The group's pages

Opening a group shows a left rail with the pages you can reach:

| Page            | What it holds                                                             |
| --------------- | ------------------------------------------------------------------------- |
| **Overview**    | The group's picture, its name and description, and how many agents it has |
| **Members**     | Who is in the group, and at which role                                    |
| **Agents**      | The agents that belong to the group                                       |
| **Tools**       | The tool settings the group's agents share                                |
| **LLM Drivers** | The LLM configurations the group's agents run on                          |
| **Speech**      | The speech provider the group's agents use                                |
| **Settings**    | The group's own settings — see below                                      |

A plain **member** sees the first three; the rest are for the group's owner and admins.

## Group settings

### Profile

The **name** and the **description** are what a group list shows — one short line that tells a member which group this is.

### Group Information

The **Group Information** field is the rich block: the address, how to reach the organisation, the opening hours. It is Markdown, so a heading and a list are as easy to write as a sentence. It is saved together with the name and the description in one step — press **Save Changes**.

Leave it empty and the group's agents fall back to the name and the description alone.

### Locations

**Locations** are the addresses the group can be reached at — "Head office", "Warehouse", "Berlin office". Each one has a name, a full address and a **default** flag.

- **Add location** opens the form. The name and the address are both required.
- The pencil button edits a location; the bin button removes it.
- Ticking **Set as default** marks that address as the group's main one and clears the flag on the others. A group has one default address, not one per person — the flag belongs to the group.

A failed save keeps the form open, with the error above it, so nothing you typed is lost.

## What the group's agents see

The group's agents read the group's information and its locations when they answer "where are you?" or "how do I reach you?". The tool that does it is `principal_info` — see [Tools → principal_info](/reference/concepts/tools) for what it returns, and [Principals](/reference/concepts/principals) for the model behind it.

A scheduled prompt can name the group too, with the `{{principal_type}}`, `{{principal_name}}`, `{{principal_description}}` and `{{principal_information}}` placeholders — see [Scheduling agents → Principal placeholders](/start/end-users/scheduling-agents#principal-placeholders).

## Who may change what

| Caller                          | The group row (name, description, information) | The group's settings pages |
| ------------------------------- | ---------------------------------------------- | -------------------------- |
| Member, role `owner` or `admin` | may change                                     | may change                 |
| Member, any other role          | refused                                        | refused                    |
| Global admin, not a member      | may change                                     | refused                    |
| Global admin and a member       | may change                                     | may change                 |
| Not a member                    | refused                                        | refused                    |

A **global admin** edits the group row from **Admin overview → Groups**, where the group is one of the rows of the list. The group's own settings pages belong to the people who run the group, so they are membership-gated even for an admin.
