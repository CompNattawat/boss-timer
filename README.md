# Boss Timer (Discord Only)

บอท Discord สำหรับจัดการ **ตารางเกิดบอส** — รองรับบอสเกิดซ้ำตามชั่วโมง และบอส **fixed-time**

## Deploy on Railway
1) Project + add-ons: 
	- Postgres, 
	- Upstash Redis
2) Services: 
	- **bot** (`SERVICE_ROLE=bot`), 
	- **worker** (`SERVICE_ROLE=worker`)
3) Set ENV from `.env.example`
4) Initialize (run on bot console):
	`bash
	npm run prisma:migrate
	npm run prisma:seed
	npm run register`

## Install and Config bot
1.	เลือกแชนแนลสำหรับตารางบอส:
- `/config channel channel:#<ชื่อแชนแนล>` บอทจะบันทึกแชนแนลไว้ใน DB ของกิลด์
2.	อัปเดตตารางครั้งแรก:
- `/boss table`

## Slash Commands
🐲 บอสเกิดซ้ำ (Normal respawn)
- `/boss add name:<ชื่อบอส> hours:<ชั่วโมง> [game:<โค้ดเกม>]`
- `/boss death name:<ชื่อบอส> time:<HH:mm [DD/MM/YY]> [game:<โค้ดเกม>]`
- `/boss reset name:<ชื่อบอส>`
- `/boss reset-all`
- `/boss delete name:<ชื่อบอส>`
- `/boss table`

⏰ บอสเวลา fix (Fixed-time)
- `/fix add name:<ชื่อบอส> cron:<cron>`
- `/fix list [game:<โค้ดเกม>]`
- `/fix remove id:<ruleId>`
- `/fix toggle id:<ruleId> enabled:true|false`

## Notes
- `แจ้งเตือนก่อนเกิด 10 นาที + ตอนเกิดจริง
- `Fixed-time ใช้ DB (FixedRule) จัดการด้วยคำสั่ง /fix ได้เลย# boss-timer
