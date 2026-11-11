---
title: "Privacy and encryption"
editUrl: https://github.com/Pourii83/Flock/edit/main/README.md
---

<!-- Generated from README.md by docs-site/scripts/sync-readme.py. Edit the README instead. -->

- **In transit:** with HTTPS everything between the apps and your server is encrypted (TLS).
- **Calls** are encrypted between the participants (WebRTC DTLS-SRTP). A TURN relay only forwards encrypted packets.
- **Normal chats** are stored on your server in readable form, so they work on all your devices with full history and files.
- **Secret chats** are end-to-end encrypted (Curve25519 + XSalsa20-Poly1305, via [TweetNaCl](https://tweetnacl.js.org)). Each device creates its own key pair and only the public key goes to the server, so the server stores only ciphertext. A secret chat lives on one device on each side: it isn't visible on your other devices, and it's lost if you clear the browser data or reinstall the app. Both people see the same *safety code*; compare it in person or on a call to make sure nobody swapped the keys. Files can't be sent in secret chats yet.
- Meeting guests (people without an account) get a pass for that one room only, valid at most until the room expires.
