 require("dotenv").config();
 const express = require("express");
 const mongoose = require("mongoose");
 const cors = require("cors");
 const twilio = require("twilio");

 const app = express();
 const PORT = 3000;

 // 🔧 Middlewares globaux
 app.use(cors());
 app.use(express.json());

 // 🔐 Mot de passe admin
 const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

 // 📱 Configuration Twilio
 const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
 const TWILIO_PHONE = process.env.TWILIO_PHONE;
 const MIREILLE_PHONE = process.env.MIREILLE_PHONE;

 // 🛡 Middleware de sécurité
 function verifierMotDePasse(req, res, next) {
   const motDePasse = req.headers["x-admin-password"];
   if (motDePasse !== ADMIN_PASSWORD) {
     return res.status(403).send("⛔ Accès refusé");
   }
   next();
 }

 // 🔐 Route de connexion
 app.post("/login", (req, res) => {
   const { password } = req.body;
   if (password === ADMIN_PASSWORD) {
     res.status(200).json({ success: true });
   } else {
     res
       .status(401)
       .json({ success: false, message: "Mot de passe incorrect" });
   }
 });

 // 📦 Connexion MongoDB

      mongoose
        .connect(process.env.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        })
        .then(() => console.log("✅ Connecté à MongoDB Atlas"))
        .catch((err) => console.error("❌ Erreur MongoDB :", err));

 // 📄 Modèle de réservation
 const reservationSchema = new mongoose.Schema({
   nom: String,
   telephone: String,
   date: String,
   heure: String,
   coiffure: String,
 });
 const Reservation = mongoose.model("Reservation", reservationSchema);

 // 📅 Modèle de créneau
 const creneauSchema = new mongoose.Schema({
   heure: String,
 });
 const Creneau = mongoose.model("Creneau", creneauSchema);

 // 🕒 Créneaux horaires par défaut
 const CRENEAUX_PAR_DEFAUT = [
   "06:30",
   "09:00",
   "10:30",
   "12:00",
   "13:30",
   "15:00",
   "16:30",
 ];

 // 📬 Enregistrement d'une réservation + Notification SMS
 app.post("/notifier-mireille", async (req, res) => {
   const { nom, telephone, date, heure, coiffure } = req.body;

   if (!nom || !telephone || !date || !heure || !coiffure) {
     return res.status(400).send("⛔ Données manquantes");
   }

   try {
     await Reservation.create({ nom, telephone, date, heure, coiffure });

     await twilioClient.messages.create({
       body: `📋 Nouvelle réservation : ${nom}, ${date} à ${heure} pour ${coiffure}`,
       from: TWILIO_PHONE,
       to: MIREILLE_PHONE,
     });

     res.send("✅ Réservation enregistrée et notification envoyée");
   } catch (err) {
     console.error("❌ Erreur Twilio :", err);
     res.status(500).send("⛔ Échec de l'envoi du SMS");
   }
 });

 // 📅 Route publique pour récupérer les créneaux
 app.get("/creneaux", async (req, res) => {
   try {
     const creneaux = await Creneau.find({});
     if (creneaux.length === 0) {
       res.json(CRENEAUX_PAR_DEFAUT);
     } else {
       res.json(creneaux.map((c) => c.heure));
     }
   } catch (err) {
     console.error("❌ Erreur chargement des créneaux :", err);
     res.status(500).send("⛔ Erreur serveur");
   }
 });

 // 📆 Créneaux déjà pris pour une date
 app.get("/disponibilites", async (req, res) => {
   const { date } = req.query;
   if (!date) return res.status(400).send("⛔ Date requise");
   const reservations = await Reservation.find({ date });
   const heuresPrises = reservations.map((r) => r.heure);
   res.json(heuresPrises);
 });

 // 🔐 Liste des réservations (admin)
 app.get("/admin/reservations", verifierMotDePasse, async (req, res) => {
   const { date, coiffure, telephone } = req.query;
   let filtre = {};
   if (date) filtre.date = date;
   if (coiffure) filtre.coiffure = coiffure;
   if (telephone) filtre.telephone = telephone;
   const reservations = await Reservation.find(filtre);
   res.json(reservations);
 });

 // 🔐 Obtenir une réservation par ID
 app.get("/admin/reservations/:id", verifierMotDePasse, async (req, res) => {
   try {
     const reservation = await Reservation.findById(req.params.id);
     if (!reservation) return res.status(404).send("⛔ Cliente introuvable");
     res.json(reservation);
   } catch (err) {
     console.error("❌ Erreur récupération fiche :", err);
     res.status(500).send("⛔ Erreur serveur");
   }
 });

 // 🔐 Modifier une réservation
 app.put("/admin/reservations/:id", verifierMotDePasse, async (req, res) => {
   try {
     const updated = await Reservation.findByIdAndUpdate(
       req.params.id,
       req.body,
       { new: true }
     );
     if (!updated) return res.status(404).send("⛔ Réservation introuvable");
     res.send("✅ Réservation mise à jour");
   } catch (err) {
     console.error("❌ Erreur modification :", err);
     res.status(500).send("⛔ Erreur serveur");
   }
 });

 // 🔐 Supprimer une réservation
 app.delete("/admin/reservations/:id", verifierMotDePasse, async (req, res) => {
   await Reservation.findByIdAndDelete(req.params.id);
   res.send("✅ Réservation supprimée");
 });

 // 🔐 Envoyer un rappel (simulation)
 app.post("/admin/rappel/:id", verifierMotDePasse, async (req, res) => {
   const reservation = await Reservation.findById(req.params.id);
   if (!reservation) return res.status(404).send("⛔ Réservation introuvable");

   console.log(
     `📲 Rappel envoyé à ${reservation.telephone} pour ${reservation.date} à ${reservation.heure}`
   );
   res.send("✅ Rappel simulé");
 });

 // 🔐 Ajouter un créneau
 app.post("/admin/creneaux", verifierMotDePasse, async (req, res) => {
   const { heure } = req.body;
   if (!heure) return res.status(400).send("⛔ Heure requise");
   await Creneau.create({ heure });
   res.send("✅ Créneau ajouté");
 });

 // 🔐 Supprimer un créneau
 app.delete("/admin/creneaux/:heure", verifierMotDePasse, async (req, res) => {
   await Creneau.deleteOne({ heure: req.params.heure });
   res.send("✅ Créneau retiré");
 });

 const path = require("path");

 // Servir les fichiers statiques (admin.html, CSS, JS)
 app.use(express.static(path.join(__dirname, "public")));

 // Route pour afficher l'interface admin
 app.get("/admin", (req, res) => {
   res.sendFile(path.join(__dirname, "public", "admin.html"));
 });

  // 🌐 Route racine pour test de déploiement
app.get("/", (req, res) => {
  res.send("Bienvenue sur le backend de Mireille 💅");
});

 // 🚀 Lancement du serveur
 app.listen(PORT, () => {
   console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
 });