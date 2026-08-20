// =========================
// API: GET /api/admin/session
// Return status login admin saat ini (dibaca dari cookie sesi).
// =========================

const { getLoggedInAdmin, isOwnerUsername } = require("../../lib/auth");

module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method tidak diizinkan" });
    }

    const username = getLoggedInAdmin(req);

    if (!username) {
        return res.status(200).json({ loggedIn: false });
    }

    return res.status(200).json({ loggedIn: true, username, isOwner: isOwnerUsername(username) });
};
