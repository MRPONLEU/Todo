# Security Specification - Todo List App

## Data Invariants
- A Todo document must have a `text` (string, max 500 chars).
- A Todo document must have a `completed` (boolean).
- A Todo document must have an `ownerId` which matches the `request.auth.uid`.
- `ownerId` and `createdAt` are immutable after creation.
- Users can only read, update, or delete their own todos.

## The "Dirty Dozen" Payloads (Denial Tests)

1. **Identity Spoofing**: Create a todo with `ownerId` of another user.
2. **Missing Auth**: Create a todo while not signed in.
3. **Invalid Type (Text)**: Create a todo where `text` is a number or boolean.
4. **Invalid Type (Completed)**: Create a todo where `completed` is a string.
5. **Missing Field**: Create a todo with missing `text`.
6. **Shadow Field**: Create a todo with an extra field `isAdmin: true`.
7. **Unauthorized Read**: Read a todo belonging to another user.
8. **Unauthorized Update**: Change `completed` status of another user's todo.
9. **Unauthorized Delete**: Delete another user's todo.
10. **Immutable Field Attack**: Try to change the `ownerId` of an existing todo.
11. **Timestamp Spoofing**: Provide a custom `createdAt` date instead of `request.time`.
12. **Malicious ID**: Attempt to create a document with a 1MB string as ID.

## Test Runner (Planned)
The `firestore.rules` will be validated against these scenarios.
