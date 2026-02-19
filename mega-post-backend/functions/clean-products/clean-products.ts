import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
};



function cleanCaptionForFB(caption: string) {
  return caption
    .replace(/<b>/g, "").replace(/<\/b>/g, "")
    .replace(/<blockquote>/g, "").replace(/<\/blockquote>/g, "")
    .replace(/<s>/g, "").replace(/<\/s>/g, "");
}

function buildPriceSection(p: any, isExpired = false) {
  if (isExpired || !p.price || p.price <= 0) {
    return "";
  }
  const extra = p.extra_payment_discount ?? 0;
  const finalPrice = extra > 0 ? p.price * (1 - extra / 100) : p.price;
  return `بـ <b>${Math.floor(finalPrice)} جنيه</b>`;
}

function rebuildCaption(productsInPost: any[], now: Date) {
  let caption = "";

  for (let i = 0; i < productsInPost.length; i++) {
    const p = productsInPost[i];
    const pubDate = new Date(p.published_at || p.last_update);
    const isExpired = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60) >= 36;

    if (p.template_id === 3 && p.custom_template) {
      let template = p.custom_template;
      template = template.replace(/{{TITLE}}/g, p.title || '');
      template = template.replace(/{{LINK}}/g, p.affiliate_link || '');

      template = template.replace(/{{PRICE}}/g, isExpired ? "انتهى ❌" : `${Math.floor(p.price)} ج`);
      template = template.replace(/{{OLD_PRICE}}/g, "");

      template = template.replace(/{{FOOTER}}/g, "");

      caption += template;
    }
    else {
      const priceText = buildPriceSection(p, isExpired);
      if (productsInPost.length > 1) {
        caption += `⬅️ ${p.title} ${priceText}\n${p.affiliate_link}`;
      } else {
        caption += `<b>${p.title}</b>\n${priceText ? '<blockquote>' + priceText + '</blockquote>\n' : ''}\n🔗 لينك المنتج:\n${p.affiliate_link}`;
      }

    }

    if (i !== productsInPost.length - 1) caption += "\n\n";
  }

  return (caption.trim() + "\n\n#ad").replace(/\n{3,}/g, '\n\n');
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: allConfigs } = await supabase.from("user_settings").select("*");
    if (!allConfigs || allConfigs.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No users to clean" }), { headers: corsHeaders });
    }

    const now = new Date();
    let totalCleaned = 0;
    const allTasks: Promise<any>[] = [];

    for (const config of allConfigs) {
      const deviceId = config.device_id;

      const realTgToken = config.tg_bot_token;
      const realFbPageToken = config.fb_access_token;

      const { data: userProducts } = await supabase.from("products")
        .select("*, custom_template, footer_text")
        .eq("user_id", deviceId);

      if (!userProducts || userProducts.length === 0) continue;

      const expiredProducts = userProducts.filter(p => {
        const pubDate = new Date(p.published_at || p.last_update);
        return (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60) >= 36;
      });

      if (expiredProducts.length === 0) continue;

      const processedTG = new Set();
      const processedFB = new Set();
      const filesToRemove: string[] = [];

      for (const p of expiredProducts) {
        if (p.image && p.image.includes("/banners/")) {
          const pathParts = p.image.split('/banners/');
          if (pathParts.length > 1) {
            const fullPath = pathParts[pathParts.length - 1].split('?')[0];
            if (fullPath) filesToRemove.push(fullPath);
          }
        }



        if (p.message_id && !processedTG.has(p.message_id)) {
          const productsInThisTG = userProducts.filter(item => item.message_id === p.message_id);
          const finalTG = rebuildCaption(productsInThisTG, now);

          allTasks.push(
            fetch(`https://api.telegram.org/bot${realTgToken}/editMessageCaption`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: config.tg_chat_id,
                message_id: p.message_id,
                caption: finalTG,
                parse_mode: "HTML"
              })
            }).catch(e => console.error(`TG Error (User ${deviceId}):`, e))
          );
          processedTG.add(p.message_id);
        }

        if (p.fb_post_id && !processedFB.has(p.fb_post_id)) {
          const productsInThisFB = userProducts.filter(item => item.fb_post_id === p.fb_post_id);
          const finalFB = rebuildCaption(productsInThisFB, now);
          const cleanText = cleanCaptionForFB(finalFB);

          allTasks.push(
            fetch(`https://graph.facebook.com/v19.0/${p.fb_post_id}`, {
              method: "POST",
              body: new URLSearchParams({
                message: cleanText,
                access_token: realFbPageToken
              })
            }).catch(e => console.error(`FB Page Error (User ${deviceId}):`, e))
          );

          processedFB.add(p.fb_post_id);
        }
      }

      if (filesToRemove.length > 0) {
        try {
          await supabase.storage
            .from('banners')
            .remove(filesToRemove);
        } catch (e) {
          console.error(`Storage Removal Error (User ${deviceId}):`, e.message);
        }
      }

      const expiredAsins = expiredProducts.map(p => p.asin);
      try {
        const { error: deleteError } = await supabase.from("products")
          .delete()
          .in("asin", expiredAsins)
          .eq("user_id", deviceId);
        
        if (!deleteError) {
          totalCleaned += expiredAsins.length;
        } else {
          console.error(`DB Delete Error (User ${deviceId}):`, deleteError.message);
        }
      } catch (e) {
        console.error(`DB Global Error (User ${deviceId}):`, e.message);
      }
    }

    await Promise.allSettled(allTasks);

    return new Response(JSON.stringify({
      ok: true,
      total_cleaned: totalCleaned,
      total_api_updates: allTasks.length
    }), { headers: corsHeaders });

  } catch (e) {
    console.error("Global Cleanup Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});