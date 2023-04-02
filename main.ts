import { createScraper, xml, utils } from "query-sdk"

const scraper = createScraper();

scraper.setNetworkDomain("geekdo.com");

scraper.setHandler(async query => {
  let document = await scraper.fetcher.xml(`https://api.geekdo.com/xmlapi/search?search=${utils.escapeUri(query)}`);
  const objectIds = xml.search<Attr>(".//boardgame/@objectid", document).map(a => a.value);
  if (objectIds.length == 0) {
    return;
  }
  document = await scraper.fetcher.xml(`https://api.geekdo.com/xmlapi/boardgame/${objectIds.join("%2C")}?stats=1`);
  for (const boardgame of xml.search<Node>("./boardgame", document.documentElement)) {
    // skip expansions
    if (xml.find("./boardgamecategory[@objectid='1042']", boardgame) != null || xml.find("./boardgamecategory[@objectid='2687']", boardgame) != null) {
      continue;
    }
    // filter by ratings
    let ratings = utils.parseNumber(xml.find<Node>("./statistics/ratings/usersrated", boardgame)?.textContent);
    if (!ratings || ratings < 50) {
      continue;
    }
    const item = scraper.item();
    item.entry("boardGameGeekId", utils.parseNumber(xml.find<Attr>("./@objectid", boardgame)?.value));
    item.entry("year", utils.parseNumber(xml.find<Node>("./yearpublished", boardgame)?.textContent));
    const minPlayers = xml.resolveNumericTextContent(xml.find<Node>("./minplayers", boardgame));
    item.entry("minPlayers", minPlayers);
    const maxPlayers = xml.resolveNumericTextContent(xml.find<Node>("./maxplayers", boardgame));
    item.entry("maxPlayers", maxPlayers);
    item.entry("mechanic", xml.search<Node>("./boardgamemechanic", boardgame).map(n => n.textContent));
    let rating = utils.parseNumber(xml.find<Node>("./statistics/ratings/average", boardgame)?.textContent);
    if (rating != null) {
      item.entry("rating", Math.round(rating * 10) / 10);
    }
    // merge subdomains and categories
    let categories = xml.search<Node>("./boardgamesubdomain", boardgame).map(n => n.textContent).concat(...xml.search<Node>("./boardgame/boardgamecategory", boardgame).map(n => n.textContent));
    categories = [...new Set(categories)].filter(c => !categories.some(o => o != c && o.includes(c)));
    item.entry("category", categories);
    item.entry("english/name", xml.find<Node>("./name[@primary='true']", boardgame)?.textContent);
    item.entry("english/description", xml.find<Node>("./description", boardgame)?.textContent);
    item.entry("english/coverUrl", xml.find<Node>("./image", boardgame)?.textContent);
    // get recommended player counts
    xml.drilldown(boardgame, "./poll[@name='suggested_numplayers']", context => {
      let lastBest = 0;
      let minRecommendedPlayers: number = null;
      let maxRecommendedPlayers: number = null;
      let recommendedPlayers: number = null;
      for (var numPlayers = minPlayers; numPlayers <= maxPlayers; numPlayers++) {
        xml.drilldown(context, `./results[@numplayers='${numPlayers}']`, context => {
          let recommended = utils.parseNumber(xml.find<Attr>("./result[@value='Recommended']/@numvotes", context)?.value);
          let notRecommended = utils.parseNumber(xml.find<Attr>("./result[@value='Not Recommended']/@numvotes", context)?.value);
          let best = utils.parseNumber(xml.find<Attr>("./result[@value='Best']/@numvotes", context)?.value);
          if (recommended != null && notRecommended != null && recommended > notRecommended) {
            if (minRecommendedPlayers == null) {
              minRecommendedPlayers = numPlayers;
            }
            maxRecommendedPlayers = numPlayers;
          }
          if (best != null && (best > lastBest)) {
            lastBest = best;
            recommendedPlayers = numPlayers;
          }
        });
      }
      item.entry("minRecommendedPlayers", minRecommendedPlayers);
      item.entry("maxRecommendedPlayers", maxRecommendedPlayers);
      item.entry("recommendedPlayers", recommendedPlayers);
    });
  }
});

scraper.run("Ark Nova");