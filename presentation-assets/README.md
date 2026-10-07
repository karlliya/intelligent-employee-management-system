# Project demo QR

`project-demo-qr.png` opens the IEMS login page through the current temporary HTTPS demo tunnel.
`project-demo-url.txt` records the exact URL encoded in the PNG.
`IEMS_FYP_Project_Demo_QR.pdf` is the complete 28-slide presentation with the current QR on slide 27.
`project-demo-slide-with-qr.png` is a preview of slide 27 with the current QR.

Before presenting:
1. Keep this PC powered on and connected to the internet.
2. Run `start-public-demo.bat` to start MySQL, backend, and a Cloudflare Quick Tunnel in secure mode. It refreshes the QR PNG, URL file, PDF, and slide preview each time.
3. Scan the QR from any internet-connected phone or computer. The URL is also in `project-demo-url.txt`.
4. Sign in using a real email account that can receive OTP. `@iems.local` demo accounts work only on the local sample server at `http://127.0.0.1:5001` on this PC.

The tunnel is temporary, not permanent hosting. When the tunnel stops or the PC turns off, the QR will stop working. Do not share real employee credentials with the audience.
