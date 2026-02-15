import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-id',
}

const imageCache = new Map();
const CACHE_TTL = 3600 * 1000;

async function generateProductCardImage(product: { asin: string, url: string, browserlessKey: string }) {
  try {
    const productUrl = product.url || `https://www.amazon.eg/dp/${product.asin}`;
    console.log(`📸 Taking screenshot for ${product.asin}...`);

    const puppeteer = (await import("npm:puppeteer-core")).default;
    
    const endpoint = `wss://chrome.browserless.io?token=${product.browserlessKey}&--lang=ar-EG`;
    
    const browser = await puppeteer.connect({
      browserWSEndpoint: endpoint,
      defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } 
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ar-EG,ar;q=0.9'
    });

    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36");

    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    
    await new Promise(r => setTimeout(r, 4000));

    await page.evaluate(() => {
      const selectorsToHide = [
        '#nav-belt', '#nav-main', '#nav-swmslot', '.s-breadcrumb',
        '#feature-bullets', '#productDescription_feature_div', '#aplus',
        '#ask_feature_div', '#customer-reviews_feature_div', '#detail-bullets_feature_div',
        '#productOverview_feature_div', '#comparison_table_feature_div',
        '#navFooter', '.nav-footer', '#sizeChartV2Data_feature_div',
        '#inline-twister-row-size_name', '[data-card-metrics-id*="tell-amazon"]',
        'span[data-action="show-all-offers-display"]',
        '#bylineInfo_feature_div', '#brandSnapshot_feature_div'
      ];

      selectorsToHide.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => { if (el instanceof HTMLElement) el.style.display = 'none'; });
      });

      const allDivs = document.querySelectorAll('div');
      allDivs.forEach(div => {
        if (div.innerText && div.innerText.length > 1000 && 
            !div.querySelector('img') && 
            !div.closest('#rightCol') && 
            !div.closest('#buybox')) {
          if (div instanceof HTMLElement) div.style.display = 'none';
        }
      });
    });

    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 1000));

    const element = await page.$('#ppd');
    let imageBuffer;

    if (element) {
      const box = await element.boundingBox();
      imageBuffer = await page.screenshot({
        type: 'png',
        clip: {
          x: Math.max(0, box.x - 20),
          y: Math.max(0, box.y - 20),
          width: box.width + 40,
          height: box.height *.75+ 20
        }
      });
    } else {
      imageBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 800 } });
    }

    await browser.close();
    return imageBuffer;

  } catch (error) {
    console.error("❌ Puppeteer Error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { asin, url } = await req.json();
    const deviceId = req.headers.get('x-device-id');

    if (!deviceId) throw new Error("x-device-id header is missing");

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userSettings, error: dbError } = await supabase
      .from('user_settings')
      .select('browserless_key')
      .eq('device_id', deviceId)
      .single();

    if (dbError || !userSettings?.browserless_key) {
      throw new Error("Could not find browserless_key for this device in user_settings table");
    }

    if (imageCache.has(asin)) {
      const cached = imageCache.get(asin);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        return new Response(JSON.stringify({ screenshot_url: cached.url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const buffer = await generateProductCardImage({ 
      asin, 
      url, 
      browserlessKey: userSettings.browserless_key 
    });

    if (!buffer) throw new Error("Failed to capture image buffer");

    const fileName = `${asin}_${Date.now()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('banners')
      .upload(fileName, buffer, { 
        contentType: 'image/png',
        upsert: true 
      });

    if (uploadError) {
      console.error("Storage Error:", uploadError);
      throw new Error(`Storage error: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('banners')
      .getPublicUrl(fileName);

    imageCache.set(asin, { url: publicUrl, timestamp: Date.now() });

    return new Response(
      JSON.stringify({ screenshot_url: publicUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
})