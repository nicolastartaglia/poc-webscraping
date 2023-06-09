const puppeteer = require('puppeteer');
const mongoose = require('mongoose');

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

    console.log('Suppression des données de navigation');
    const client = await page.target().createCDPSession();
    await client.send('Network.clearBrowserCookies');
    await client.send('Network.clearBrowserCache');

    await page.setViewport({ width: 1440, height: 1024 });

    console.log('Chargement de la page web Carrefour');
    
    const buttonAcceptCookies = '#onetrust-accept-btn-handler';
    await page.goto(url, { waitUntil: ['networkidle0'] });
   
    await page.waitForSelector(buttonAcceptCookies, { visible: true });
    console.log("Clic sur la popup d'acceptation des cookies");
    await page.click(buttonAcceptCookies);
    
    console.log("Recherche des produits correspondant à '" + mySearch + "'");
    const searchInput = await page.$('[name="q"]');
    await searchInput.type(mySearch);
    await page.keyboard.press('Enter');
    await page.waitForNavigation({ waitUntil: ['networkidle2'] });

    if (await page.$('div.search-no-result__content') !== null) {
        const produit = new Produit({ job: job, distributeur: distributeur, codeBarre: mySearch, price: "pas trouvé" });
        await produit.save();
    } else {
        console.log("Récupération de tous les liens web des produits recherchés");
        const selectorProduct = 'a.product-card-image';
        const selectorIngredients = 'div.product-block-content > div > button';
        const productLinkList = await page.$$eval(
            selectorProduct,
            (products => products.map(product => {
                return { link: product.href, title: product.title }
            }))
        );

        if (productLinkList.length != 0) {
            for (const { link, title } of productLinkList) {

                console.log("Chargement d'une page produit: " + link);
                await page.goto(link, { waitUntil: ['networkidle2'] });

                console.log("Temporisation aléatoire entre 8 et 12 secondes");
                await page.waitForTimeout(getRandomInt(8000, 12000));
                // const product = await page.waitForSelector(selectorIngredients);
                // if (product != null) await product.click();
                //const blockPrice = await page.waitForSelector('div.pdp-pricing__block-left > div:nth-child(2)');
                const blockPrice = await page.waitForSelector("div[class='pdp-pricing__block-left'] p[class='pl-text pl-text--size-s pl-text--style-p']");
                // await completeBlockIngredients.click();
                const price = await page.evaluate(el => el.innerText, blockPrice);
                const produit = new Produit({ job: job, distributeur: distributeur, codeBarre: mySearch, price: price });
                await produit.save();
                console.log('Prix ajouté en BD');
            }
        }
    }

    console.log('Fermeture du navigateur Chromium');
    await browser.close();
    await mongoose.connection.close();
    xvfb.stopSync();
})();

