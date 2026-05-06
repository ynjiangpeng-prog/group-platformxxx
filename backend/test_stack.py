import asyncio, sys, traceback
sys.path.insert(0, '/opt/group-platform/backend')

async def test():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import select
    from app.models.organization import User
    
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/group_platform')
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        result = await db.execute(select(User).limit(1))
        user = result.scalar_one_or_none()
        if not user:
            print('No user')
            return
            
        try:
            from app.api.v1.system.router import dashboard_stats
            await dashboard_stats(current_user=user, db=db)
            print('OK')
        except Exception as e:
            traceback.print_exc()

asyncio.run(test())