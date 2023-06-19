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
    const Produit = mongoose.model('HouraProduit', distributeurSchema);


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

    console.log('Suppression des données de navigation');
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    console.log('Chargement de la page web Houra');
    await page.goto(url, { waitUntil: ['networkidle2'] });
    // Villiers-en-Bière (77190)
    await page.setGeolocation({
        latitude: 48.4942806,
        longitude: 2.5991623
    });
    const granted = await page.evaluate(async () => {
        return (await navigator.permissions.query({ name: 'geolocation' })).state;
    });
    console.log('Granted:', granted);
    await page.setViewport({ width: 1440, height: 1024 });

    const buttonAcceptCookies = '#tarteaucitronPersonalize2';
    
    console.log("Clic sur la popup d'acceptation des cookies");
    await page.waitForSelector(buttonAcceptCookies, { visible: true });
    await page.click(buttonAcceptCookies);

    const searchZone = '#CPProspect';
    const search = await page.waitForSelector(searchZone, { visible: true });
    search.type("91120");
    await page.keyboard.press('Enter');

    const buttonGeolocation = 'input[value="Je découvre"]';
    const btngeo = await page.waitForSelector(buttonGeolocation, { visible: true });
    btngeo.click(buttonGeolocation);


    //await page.waitForTimeout(getRandomInt(4000, 6000));

    for (const recherche of codeBarre) {
        
        const doc = await Produit.findOne({ codeBarre: recherche });
        if (doc == null) {
            await page.waitForTimeout(getRandomInt(4000, 6000));
            console.log(recherche);
            console.log("Recherche des produits correspondant à '" + recherche + "'");
            const searchInput = await page.$('#pertimmSearch');
            await searchInput.type(recherche);
            await page.keyboard.press('Enter');
            await page.waitForNavigation({ waitUntil: ['networkidle2'] });

            if (await page.$('p.alert.alert-danger') !== null) {
                const produit = new Produit({ job: job, distributeur: distributeur, codeBarre: recherche, price: "pas trouvé" });
                await produit.save();
            } else {
                console.log("Récupération de tous les liens web des produits recherchés");
                const selectorProduct = 'ul.articles > li > div > div > a.link_article';
                //const selectorIngredients = 'div.product-block-content > div > button';
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
                        //await page.waitForTimeout(getRandomInt(4000, 6000));
                        // const product = await page.waitForSelector(selectorIngredients);
                        // if (product != null) await product.click();
                        const blockPrice = await page.waitForSelector('div.art_prix_volume');
                        // await completeBlockIngredients.click();
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

