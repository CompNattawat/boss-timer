# Boss Timer (Discord Only)

บอท Discord สำหรับจัดการ **ตารางเกิดบอส** — รองรับบอสเกิดซ้ำตามชั่วโมง และบอส **fixed-time**

## Slash Commands

### Normal respawn
- `/boss add name:<ชื่อบอส> hours:<ชั่วโมง> [game:<โค้ดเกม>]`
- `/boss death name:<ชื่อบอส> time:<HH:mm [DD/MM/YY]> [game:<โค้ดเกม>]`
- `/boss reset-all`
- `/boss table`

### Fixed-time (manage rules without redeploy)
- `/fix add name:<ชื่อบอส> cron:<cron>`
- `/fix list [game:<โค้ดเกม>]`
- `/fix remove id:<ruleId>`
- `/fix toggle id:<ruleId> enabled:true|false`

## Deploy on Railway
1) Project + add-ons: Postgres, Upstash Redis
2) Services: **bot** (`SERVICE_ROLE=bot`), **worker** (`SERVICE_ROLE=worker`)
3) Set ENV from `.env.example`
4) Initialize (run on bot console):
``bash
npm run prisma:migrate
npm run prisma:seed
npm run register ``

5) In Discord: /boss table → copy Message ID → set DISCORD_SCHEDULE_MESSAGE_ID → /boss table again

## Notes
	•	แจ้งเตือนก่อนเกิด 10 นาที + ตอนเกิดจริง
	•	Fixed-time ใช้ DB (FixedRule) จัดการด้วยคำสั่ง /fix ได้เลย# boss-timer
