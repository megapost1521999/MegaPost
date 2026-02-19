import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7?bundle";



const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8"

};



function getArabicTime() {
  const now = new Date();
  const options = { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true };
  let timeStr = now.toLocaleTimeString('en-US', options as any);

  return timeStr
    .replace('AM', 'ص')
    .replace('PM', 'م');
}



function buildDynamicCaption(p: any, isFB = false) {
  const extra = p.extra_payment_discount || 0;
  const finalPrice = extra > 0 ? Math.floor(p.price * (1 - extra / 100)) : Math.floor(p.price);
  const oldPrice = p.old_price ? Math.floor(p.old_price) : null;
  const timePart = getArabicTime();
  const title = p.title || '';
  const link = p.affiliate_link || '';

  if (finalPrice <= 0) {
    return `${isFB ? '' : '<b>'}${title}${isFB ? '' : '</b>'}\n\n❌ غير متوفر حالياً\n\n🔗 الرابط:\n${link}\n\n🕒 ${timePart} | #ad`;
  }

  let content = "";

  if (p.template_id === 3 && p.custom_template) {
    let oldPriceMarkup = "";
    if (oldPrice && oldPrice > finalPrice) {
      oldPriceMarkup = isFB ? ` (بدلاً من ${oldPrice} ج)` : ` (بدلاً من <s>${oldPrice} ج</s>)`;
    }

    let footerSection = "";
    if (p.footer_text) {
      footerSection = p.footer_text.replace(/\(\(/g, '').replace(/\)\)/g, '').trim();
      const lines = footerSection.split('\n');
      footerSection = lines.filter(line => !line.includes('facebook.com')).join('\n');
      
      footerSection = isFB 
        ? footerSection.replace(/(https?:\/\/\S+)/g, 'اضغط هنا') 
        : footerSection.replace(/(https?:\/\/\S+)/g, '<a href="$1">اضغط هنا</a>'); 
    }

    let savingsLine = extra > 0 ? `✨ وفر ${extra}% عند الدفع` : (p.discount > 0 ? `🔥 خصم ${p.discount}%` : '');

    content = p.custom_template
      .replace(/\[1\]/g, title)
      .replace(/\[2\]/g, isFB ? `${finalPrice} ج${oldPriceMarkup}` : `<b>${finalPrice} ج</b>${oldPriceMarkup}`)
      .replace(/\[3\]/g, savingsLine)
      .replace(/\[4\]/g, link.trim())
      .replace(/\[5\]/g, footerSection);

  } 
  else {
    const offerSection = (p.quantity_offer) ? `<b>${p.quantity_offer}</b>\n\n` : "";
    
    if (p.template_id === 1) {
      const pricePart = isFB ? `${finalPrice} ج` : `<b>${finalPrice} ج</b>`;
      const oldPart = (oldPrice && oldPrice > finalPrice) ? (isFB ? ` (بدلاً من ${oldPrice} ج)` : ` (بدلاً من <s>${oldPrice} ج</s>)`) : "";
      content = `${isFB ? '' : offerSection}${title} بسعر ${pricePart}${oldPart}\n\nلينك العرض : ${link}`;
      
    } else if (p.template_id === 2) {
      content = `${isFB ? '' : offerSection}💎 ${isFB ? '' : '<b>'}${title}${isFB ? '' : '</b>'}\n\n🏷️ السعر الآن: ${isFB ? '' : '<b>'}${finalPrice} جنيه فقط${isFB ? '' : '</b>'}\n\nلينك العرض :\n${link}`;
      
    } else {
      let oldMarkup = (oldPrice && oldPrice > finalPrice) ? (isFB ? ` (بدلاً من ${oldPrice} جنيه)` : ` (بدلاً من <s>${oldPrice} جنيه</s>)`) : "";
      
      let priceBlock = isFB 
        ? `السعر النهائي ⇚ ${finalPrice} جنيه${oldMarkup}`
        : `<blockquote>🟢 السعر النهائي ⇚ <b>${finalPrice} جنيه</b>${oldMarkup}</blockquote>`;

      let discountLine = "";
      if (p.discount > 0 || extra > 0) {
        discountLine = `\n${isFB ? '' : '<b>'}${p.discount > 0 ? `🔥 خصم ${p.discount}%` : ''}${ (p.discount > 0 && extra > 0) ? ' ، ' : ''}${extra > 0 ? `✨ وفر ${extra}% عند الدفع` : ''}${isFB ? '' : '</b>'}`;
      }

      content = `${isFB ? '' : offerSection}${isFB ? '' : '<b>'}${title}${isFB ? '' : '</b>'}\n\n${priceBlock}${discountLine}\n\n🔗 لينك المنتج:\n${link}`;
    }
  }

  if (isFB) content = content.replace(/<[^>]*>/g, "");

  return `${content}\n\n🕒 آخر تحديث: ${timePart} | #ad`.replace(/\n{3,}/g, '\n\n');
}

function buildMultiCaption(products: any[]) {
  const timePart = getArabicTime();
  let caption = "";

  products.forEach((p, i) => {
    const extra = p.extra_payment_discount || 0;
    
    const basePrice = p.price || 0;
    const finalPrice = extra > 0 ? Math.floor(basePrice * (1 - extra / 100)) : Math.floor(basePrice);

    if (p.quantity_offer && p.quantity_offer.trim() !== "") {
      caption += `🎁 <b>${p.quantity_offer}</b>\n\n`;
    }

    caption += `⬅️ ${p.title} بـ <b>${finalPrice} جنيه</b>\n`;

    if (extra > 0) {
      caption += `✨ وفر ${extra}% عند الدفع\n`;
    }

    if (p.affiliate_link) {
      caption += `${p.affiliate_link.trim()}`;
    }

    if (i !== products.length - 1) {
      caption += "\n\n";
    }
  });

  return `${caption}\n\n🕒 آخر تحديث: ${timePart} | #ad`;
}

async function smartEditTelegram(config: any, messageId: number, caption: string) {

  const realToken = config.tg_bot_token;
  const baseUrl = `https://api.telegram.org/bot${realToken}`;

  const res = await fetch(`${baseUrl}/editMessageCaption`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: config.tg_chat_id,
      message_id: messageId,
      caption: caption,
      parse_mode: "HTML"
    })
  });
  return await res.json();
}

async function smartEditFacebook(config: any, fbPostId: string, caption: string) {
  const realToken = config.fb_access_token;
  const url = `https://graph.facebook.com/v19.0/${fbPostId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: caption,
      access_token: realToken
    })
  });
  return await res.json();
}



async function notifyAdmin(config, payload) {
  if (!config.tg_admin_id || !config.tg_bot_token) return;

  const baseUrl = `https://api.telegram.org/bot${config.tg_bot_token}`;
  
  const text = `
🔔 <b>تحديث تلقائي للمنتج</b>

📌 <b>الاسم:</b> ${payload.title || 'بدون عنوان'}
🆔 <b>ASIN:</b> <code>${payload.asin}</code>

💰 <b>السعر:</b> ${Math.floor(payload.oldPrice || 0)} ← <b>${Math.floor(payload.newPrice || 0)} ج.م</b>
✅ <b>الحالة:</b> ${payload.status}

🔗 <b>رابط المنتج:</b>
${payload.link}

🕒 ${getArabicTime()}
`.trim();

  try {
    const response = await fetch(`${baseUrl}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.tg_admin_id,
        photo: payload.image,
        caption: text.substring(0, 1024), 
        parse_mode: "HTML"
      })
    });

    const result = await response.json();
    if (!result.ok) {
      console.error("Telegram API Error:", result.description);
      await fetch(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.tg_admin_id,
          text: text + `\n\n🖼 [رابط الصورة](${payload.image})`,
          parse_mode: "HTML"
        })
      });
    }
  } catch (e) {
    console.error("Admin Notify Network Error:", e);
  }
}


async function sha256(message: string) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  return new Uint8Array(hashBuffer);
}
async function hmac(key: string | Uint8Array, message: string) {
  const keyBuffer = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message)));
}


function toHex(array: Uint8Array) {
  return Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmac("AWS4" + key, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return await hmac(kService, "aws4_request");
}



async function getAmazonItemsBatch(asins: string[], config: any) {
  const HOST = "webservices.amazon.eg";
  const REGION = "eu-west-1";
  const PATH = "/paapi5/getitems";

  const realAccessKey = config.amazon_access_key.trim();
  const realSecretKey = config.amazon_secret_key.trim();
  const realPartnerTag = config.amazon_partner_tag.trim();

  const payload = JSON.stringify({
    "ItemIds": asins,
    "PartnerTag": realPartnerTag,
    "PartnerType": "Associates",
    "Marketplace": "www.amazon.eg",
    "LanguagesOfPreference": ["ar_AE"],
    "Resources": [
      "Images.Primary.HighRes",
      "Images.Primary.Large",
      "Images.Variants.HighRes",
      "Images.Variants.Large",
      "ItemInfo.Title",
      "ItemInfo.Features",
      "ItemInfo.Classifications",
      "ItemInfo.ByLineInfo",
      "OffersV2.Listings.Price",
      "Offers.Listings.SavingBasis",
      "CustomerReviews.Count",
      "CustomerReviews.StarRating"
    ]
  });

  const amzDate = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-encoding": "amz-1.0",
    "content-type": "application/json; charset=utf-8",
    "host": HOST,
    "x-amz-date": amzDate,
    "x-amz-target": "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems",
  };

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k]}\n`).join("");
  const payloadHash = toHex(await sha256(payload));
  const canonicalRequest = `POST\n${PATH}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${REGION}/ProductAdvertisingAPI/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${toHex(await sha256(canonicalRequest))}`;

  const signingKey = await getSignatureKey(realSecretKey, dateStamp, REGION, "ProductAdvertisingAPI");
  const signature = toHex(await hmac(signingKey, stringToSign));

  headers["Authorization"] = `AWS4-HMAC-SHA256 Credential=${realAccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${HOST}${PATH}`, { method: "POST", headers, body: payload });
  return await res.json();
}


async function startAutoUpdate() {
  console.log("--- 🏁 Start Update Cycle ---");

  const { data: allConfigs } = await supabase.from("user_settings").select("*");
  if (!allConfigs) return { status: "no_configs" };

  for (const config of allConfigs) {
    const deviceId = config.device_id;


    const { data: products } = await supabase.from("products")
      .select("*, custom_template, footer_text")
      .eq("user_id", deviceId)
      .order("last_update", { ascending: true })
      .limit(20);
    if (!products || products.length === 0) continue;

    const currentBatchPrices = new Map();
    const chunks = [];
    for (let i = 0; i < products.length; i += 10) chunks.push(products.slice(i, i + 10));


    for (const chunk of chunks) {
      try {
        const amzData = await getAmazonItemsBatch(chunk.map(p => p.asin), config);
        const amzItems = amzData?.ItemsResult?.Items || [];
        amzItems.forEach((item: any) => {
          let price = item?.OffersV2?.Listings?.[0]?.Price?.Money?.Amount;

          if (price === undefined || price === null) {
            price = item?.Offers?.Listings?.[0]?.Price?.Amount;
          }

          if (price === undefined || price === null) {
            price = item?.OffersV2?.Listings?.[0]?.SavingBasis?.Money?.Amount;
          }

          if (price !== undefined && price !== null) {
             console.log(`[Price Check] ASIN: ${item.ASIN} | Extracted Price: ${price}`);
             currentBatchPrices.set(item.ASIN, price);
          } else {
             console.log(`[Price Check] ASIN: ${item.ASIN} | API Empty Response - Skipping update for this ASIN`);
          }
        });

        for (const p of chunk) {
          if (p.extra_payment_discount && p.extra_payment_discount > 0) {
            await supabase.from("products")
              .update({ last_update: new Date().toISOString() })
              .eq("asin", p.asin)
              .eq("user_id", deviceId);
            continue;
          }

          const newPrice = currentBatchPrices.get(p.asin);
          
          if (newPrice !== undefined && Math.floor(newPrice) !== Math.floor(p.price)) {
            console.log(`⚠️ CHANGE DETECTED: Updating ${p.asin}... | Old: ${p.price} | New: ${newPrice}`);

            const { data: siblings } = await supabase.from("products")
              .select("*")
              .eq("message_id", p.message_id)
              .eq("user_id", deviceId);

            let tgCaption = "";
            let fbCaption = "";

            if (siblings && siblings.length > 1) {
              const updatedGroup = siblings.map(s => s.asin === p.asin ? { ...s, price: newPrice } : s);
              tgCaption = buildMultiCaption(updatedGroup);
              fbCaption = tgCaption.replace(/<b>/g, "").replace(/<\/b>/g, "").replace(/<blockquote>/g, "").replace(/<\/blockquote>/g, "");
            } else {
              tgCaption = buildDynamicCaption({ ...p, price: newPrice }, false);
              fbCaption = buildDynamicCaption({ ...p, price: newPrice }, true);
            }

            if (p.message_id) await smartEditTelegram(config, p.message_id, tgCaption);
            if (p.fb_post_id) {
              await smartEditFacebook(config, p.fb_post_id, fbCaption);
            }

            await notifyAdmin(config, {
              title: p.title,
              asin: p.asin,
              image: p.image,
              link: p.affiliate_link,
              oldPrice: p.price,
              newPrice: newPrice,
              status: newPrice <= 0 ? "❌ نفد من المخزون" : "✅ تم تحديث السعر"
            });

            await supabase.from("products").update({
              price: newPrice,
              last_update: new Date().toISOString()
            }).eq("asin", p.asin).eq("user_id", deviceId);

          } else {
            await supabase.from("products").update({
              last_update: new Date().toISOString()
            }).eq("asin", p.asin).eq("user_id", deviceId);
          }
        }
      } catch (e) {
        console.error(`[Chunk Error] User ${deviceId}:`, e.message);
      }
    }

  }

  console.log("--- ✅ End Global Cycle ---");
  return { ok: true };
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const res = await startAutoUpdate();
    return new Response(JSON.stringify(res), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
