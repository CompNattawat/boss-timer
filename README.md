# Boss Timer (Discord Only)

- Slash commands: `/boss add`, `/boss death`, `/boss reset-all`, `/boss table`
- Durable alerts with BullMQ (–10m + at spawn)
- Postgres + Redis required

## Deploy (Railway)

1) Create a project with **Postgres** and **Upstash Redis** add-ons.
2) Create two services from this repo:
   - **bot**: `SERVICE_ROLE=bot`
   - **worker**: `SERVICE_ROLE=worker`
3) Set the ENV (see `.env.example`).
4) Initialize database:
   - Run once on bot service console:
     ```
     npm run prisma:migrate
     npm run prisma:seed
     npm run register
     ```
5) In Discord channel, run `/boss table` once; copy the **Message ID** and set `DISCORD_SCHEDULE_MESSAGE_ID`.

## Notes on "Fixed-time bosses"
- See `prisma/fixed-times.json` for examples.
- You can fill real fixed-time rules later; code shows how to read them.


# Boss Timer (Discord Only)

บอท Discord สำหรับจัดการ **ตารางเกิดบอส**  
รองรับทั้ง **บอสเกิดซ้ำตามชั่วโมง** และ **บอสที่เกิดตามเวลาคงที่**

---

## 📌 Slash Commands

### 1) จัดการบอสเกิดซ้ำ (Normal Respawn)

- **เพิ่ม/แก้ไขบอส**
/boss add name:<ชื่อบอส> hours:<ชั่วโมงเกิดซ้ำ> [game:<โค้ดเกม>]
➜ เพิ่มหรือแก้ไขบอสให้เกิดซ้ำทุก `<ชั่วโมง>` หลังจากตาย  

ตัวอย่าง:
/boss add name:อาคานิส hours:29
/boss add name:“ซูโพร์” hours:62 game:L9

- **บันทึกเวลาตาย**
/boss death name:<ชื่อบอส> time:<เวลา>
➜ บันทึกเวลาตายล่าสุดของบอส (เวลาไทย Asia/Bangkok)  
รองรับ `"HH:mm"` หรือ `"HH:mm DD/MM/YY"`

ตัวอย่าง:
/boss death name:อาคานิส time:“07:26”
/boss death name:“อัสตา” time:“07:26 02/09/25”

- **รีเซ็ตเวลาบอสทั้งหมด**
/boss reset-all
➜ รีเซ็ตเวลาตาย/เกิดทั้งหมด (เฉพาะแอดมิน)

- **อัปเดตตารางบอส**
/boss table
➜ อัปเดตข้อความตารางบอสในแชนแนลทันที

---

### 2) จัดการบอสเกิดตามเวลา (Fixed-time Respawn)

บอสที่เกิดตามเวลาคงที่จะถูกกำหนดในไฟล์ `prisma/fixed-times.json`  
ใช้รูปแบบ **cron expression** เพื่อกำหนดวัน/เวลา

ตัวอย่าง `prisma/fixed-times.json`:

```json
{
"L9": [
  { "name": "ซาทิรัส", "cron": ["0 16 * * 0", "30 10 * * 2"] },
  { "name": "นิวโรท", "cron": ["0 18 * * 2", "30 10 * * 4"] },
  { "name": "คลาวมนทิส", "cron": ["30 10 * * 1", "0 18 * * 4"] },
  { "name": "ไอเมล", "cron": ["0 18 * * 1", "30 10 * * 3"] },
  { "name": "มิลลาวี", "cron": ["0 14 * * 6"] },
  { "name": "โรเดอริก", "cron": ["0 18 * * 5"] },
  { "name": "ออร์คิด", "cron": ["0 20 * * 3", "0 20 * * 0"] },
  { "name": "จิงกอร์", "cron": ["0 16 * * 6"] },
  { "name": "ไชฟล็อค", "cron": ["0 21 * * 6"] }
]
}

# boss-timer
