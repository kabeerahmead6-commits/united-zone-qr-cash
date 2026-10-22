# United Zone Pay Manager

Create a Multi-Store UPI QR Code Management Application for my 5 shop branches. All branches will collect payments into a single primary bank account.
Key Features Needed:
Admin Dashboard: An admin panel where I can see different static QR codes generated for 5 branches.
UPI String Logic: The QR codes should be generated using the static UPI URL structure: upi://pay?pa=500101010524319@CIUB0000171.ifsc.npci&pn=M.Kabeer Ahamed&tn=UnitedZoneEnterprises. For example, Store 1 should have tn=Shop1, Store 2 should have tn=Shop2, and so on.
UI/UX Design: A modern, clean, and user-friendly interface. A beautiful dark mode option suitable for a restaurant/food brand would be great.
Print Option: Admin should be able to view, download, or screenshot each store's custom QR code easily so I can print them as stickers.
Sales Tracker (Optional Mockup): A basic dashboard to manually log or simulate sales coming from different branches based on the transaction notes.           Update the app to support dynamic store management. I should be able to add unlimited new store branches in the future directly from the Admin Panel.

Specific Requirements:

Add New Store Button: In the Admin Dashboard, add an 'Add New Store' button. When clicked, it should ask for the 'Store Name'.

Dynamic QR Generation: As soon as a new store is added, the app should automatically generate a brand new unique QR Code for that store.

Automated Transaction Note: The UPI URL logic must automatically assign the tn (Transaction Note) parameter based on the new store's name (e.g., tn=Shopname) so that all future stores also link to the same primary GPay UPI ID.

Store List View: Display a neat grid or list of all active stores, showing their names and their respective QR codes with a download/print option.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://united-zone-qr-cash.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6f874755-69ac-4737-a268-61721a1c0d9c).

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
