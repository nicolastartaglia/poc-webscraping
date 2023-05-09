const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require("path");
const fichier = fs.readFileSync(path.resolve(__dirname, "./liste-barre-code"), 'utf-8');
const codeBarre = fichier.split(/\r?\n/);

const url = process.env.URL;
const job = process.env.JOB;
const mySearch = process.env.SEARCH;
const distributeur = process.env.DISTRIBUTEUR;
const mongodbServer = process.env.MONGODB_SERVICE_SERVICE_HOST;
const mongodbPort = process.env.MONGODB_SERVICE_SERVICE_PORT;
const user = process.env.MONGO_USERNAME;
const password = process.env.MONGO_PASSWORD;

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min);
}

(async () => {

    console.log('starting xvfb');
    var Xvfb = require('xvfb');
    var xvfb = new Xvfb({
        xvfb_args: ['-screen', '0', '1600x1200x24+32']
    });
    xvfb.startSync();

    console.log('xvfb started');

    await mongoose.connect('mongodb://' + user + ':' + password + '@' + mongodbServer + ':' + mongodbPort + '/webscraping');
    const distributeurSchema = new mongoose.Schema({
        job: String,
        distributeur: String,
        codeBarre: String,
        price: String
    });
    const Produit = mongoose.model('Produit', distributeurSchema);


    let browser = await puppeteer.launch({
        headless: false,
        devtools: true,
        args: [
            '--no-sandbox',
            '--window-size=1440,1024',
            '--window-position=0,0'
        ],
        userDataDir: './data'
    });

    const page = await browser.newPage();
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(url, ["geolocation"]);

    console.log('Suppression des données de navigation');
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    await page.setViewport({ width: 1440, height: 1024 });

    console.log('Chargement de la page web Auchan');
    await page.goto(url, { waitUntil: ['networkidle2'] });

    // Audruicq (revenu moyen 20090€)
    await page.setGeolocation({
        latitude: 50.8786489,
        longitude: 2.0752362
    });

    const granted = await page.evaluate(async () => {
        return (await navigator.permissions.query({ name: 'geolocation' })).state;
    });
    console.log('Granted:', granted);

    console.log("Clic sur la popup d'acceptation des cookies");
    const buttonAcceptCookies = '#onetrust-accept-btn-handler';
    await page.waitForSelector(buttonAcceptCookies);
    await page.click(buttonAcceptCookies);

    console.log("Clic sur le bouton de livraison");
    await page.goto("https://www.auchan.fr", { waitUntil: ['networkidle2'] });
    const buttonShip = 'button.journey-reminder__initial-choice-button.layer__trigger_journey-reminder > i.icon-shipping';
    await page.waitForSelector(buttonShip);
    await page.click(buttonShip);

    console.log("Géolocalisation");
    const buttonGeolocation = 'button.icon-geolocation.btn.btn--round.btn--small.btn--journey-geolocate.journeyGeolocation.autoSuggest__focusout';
    await page.waitForSelector(buttonGeolocation, { visible: true });
    await page.click(buttonGeolocation);

    console.log("Choix de la livraison à domicile");
    const buttonShipChoice = 'section.journey__offering-contexts > div.journeyPosItem > div > div > div.journey-offering-context__actions > form > button';
    await page.waitForSelector(buttonShipChoice, { visible: true });
    await page.click(buttonShipChoice);

    for (const recherche of codeBarre) {
        await page.waitForTimeout(getRandomInt(4000, 6000));
        const doc = await Produit.findOne({ codeBarre: recherche });
        if (doc == null) {
            console.log("Recherche des produits correspondant à '" + recherche + "'");
            const searchInput = await page.$('input[name="text"]');
            await searchInput.type(recherche);
            await page.keyboard.press('Enter');
            await page.waitForNavigation({ waitUntil: ['networkidle2'] });

            if (await page.$('span.no-result__category') !== null) {
                const produit = new Produit({ job: job, distributeur: distributeur, codeBarre: recherche, price: "pas trouvé" });
                await produit.save();
            } else {
                console.log("Récupération de tous les liens web des produits recherchés");
                const selectorProduct = 'a.product-thumbnail__details-wrapper';
                const productLinkList = await page.$$eval(
                    selectorProduct,
                    (products => products.map(product => {
                        return { link: product.href }
                    }))
                );
                if (productLinkList.length != 0) {
                    for (const { link } of productLinkList) {

                        console.log("Chargement d'une page produit: " + link);
                        await page.goto(link, { waitUntil: ['networkidle2'] });

                        console.log("Temporisation aléatoire entre 8 et 12 secondes");
                        
                        const blockPrice = await page.waitForSelector('.product-price.product-price--small.text-color');
                        const price = await page.evaluate(el => el.innerText, blockPrice);
                        const produit = new Produit({ job: job, distributeur: distributeur, codeBarre: recherche, price: price });
                        await produit.save();
                        console.log('Prix ajouté en BD');
                    }
                }
            }
            await page.goto(url, { waitUntil: ['networkidle2'] });
        }
    }
    console.log('Fermeture du navigateur Chromium');
    await browser.close();
    await mongoose.connection.close();
    xvfb.stopSync();
})();

