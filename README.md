# Debu File

A mobile/PC responsive file portal where:
- `/` is public and download-only.
- `/admin` is protected by admin login.
- Admin can upload and delete files.
- Files are stored under `DATA_DIR/uploads`.
- Render persistent disk is mounted at `/var/data`.

## Local setup

```bash
npm install
```

Create environment variables:

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=<bcrypt hash>
SESSION_SECRET=<long random secret>
DATA_DIR=./data
MAX_FILE_SIZE_MB=500
```

Generate a bcrypt password hash:

```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD', 12))"
```

Then run:

```bash
npm start
```

Open:
- Public: http://localhost:10000/
- Admin: http://localhost:10000/admin

## Render deployment

This project includes `render.yaml`.

1. Put the project in a GitHub repository.
2. In Render, create a **Blueprint** from that repository.
3. Set `ADMIN_USERNAME`.
4. Generate a bcrypt hash locally for your password and paste it into `ADMIN_PASSWORD_HASH`.
5. Render generates `SESSION_SECRET` automatically.
6. Deploy.
7. Open the public URL for downloads and `/admin` for the admin panel.

### Important storage note

Render's normal filesystem is ephemeral. This project therefore uses a persistent disk mounted at `/var/data`. Persistent disks require a paid Render service. Keep the service at one instance because a persistent disk cannot be shared across multiple service instances.

## Security notes

- Never put the admin password or bcrypt hash in GitHub.
- Change the admin password if it is ever exposed.
- Use a long random `SESSION_SECRET` if you set it manually.
- The app blocks path traversal in download/delete routes.
- Public users have no upload or delete API access.
- This starter intentionally does not expose the filesystem as a public static directory; downloads go through the server route.
