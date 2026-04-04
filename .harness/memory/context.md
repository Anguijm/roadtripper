# roadtripper

Project context and architectural decisions.

## Initial Decisions (2026-04-04)

- **Data source:** Urban Explorer's `urbanexplorer` named Firestore database (read-only, never write)
- **Query pattern:** Flat mirror collections (`vibe_neighborhoods`, `vibe_waypoints`) for list queries; hierarchical for detail views
- **Routing:** Google Maps Directions API + Distance Matrix API for drive time calculations
- **Persona system:** Maps to Urban Explorer vibeClass + waypoint categories; defined in `lib/personas/`
- **Auth:** Clerk (same as Urban Explorer)
- **Deployment:** Firebase App Hosting
- **Dev methodology:** Feature-focused sessions, harness council for significant features, Gemini code review
