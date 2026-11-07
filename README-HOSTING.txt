MD TAUSIF TOOLS - HOSTING NOTES
===============================

WEBSITE FRONTEND
----------------
Deploy the repository root folder to Netlify.
Publish directory: .
No build command is required.

PDF COMPRESSOR BACKEND
----------------------
Deploy the backend/ folder as a Docker service on a host that supports Docker.
The included backend/Dockerfile installs Ghostscript on Linux.
Start command is handled by Dockerfile: npm start.

After backend deployment:
1. Copy the backend HTTPS URL.
2. Open pdf-compressor.html.
3. Replace https://YOUR-BACKEND-URL with the actual backend URL in API_BASE_URL.
4. Commit and redeploy the frontend.

CORS
----
Set backend environment variable ALLOWED_ORIGINS to the exact Netlify site origin,
e.g. https://your-site-name.netlify.app
If using a custom domain, include that origin too, comma-separated.

NOTES
-----
- The PDF Compressor needs Ghostscript; a plain static host such as Netlify cannot
  execute the current Express/Ghostscript backend.
- Free backend providers can sleep, impose CPU/time/file-size limits, or change
  their free-tier policies. Large PDFs may time out on free instances.
- Do not upload node_modules, backend/uploads contents, or personal PDFs to GitHub.
- The PNG to JPG card currently has href="#" because no png-to-jpg.html page exists
  in the supplied archive. No page was invented or added.
- The supplied image compressor and JPG-to-PDF pages were kept unchanged.
