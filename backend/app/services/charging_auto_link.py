"""
充电站运营数据自动关联服务
打通充电站 → 项目 → 财务链路
"""
import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

logger = logging.getLogger(__name__)


class ChargingAutoLinkService:
    """充电站数据自动关联服务"""
    
    async def auto_link_order_to_project(self, db: AsyncSession, order_id: str) -> bool:
        """根据充电站自动关联订单到项目"""
        from app.models.charging.models import ChargingOrder, ChargingStation
        from app.models.project.models import Project
        
        # 获取订单信息
        order_result = await db.execute(
            select(ChargingOrder, ChargingStation)
            .join(ChargingStation, ChargingStation.id == ChargingOrder.station_id)
            .where(ChargingOrder.id == order_id)
        )
        row = order_result.first()
        if not row:
            return False
        
        order, station = row
        
        # 如果订单已有project_id，跳过
        if order.project_id:
            return True
        
        # 根据station_id查找关联的项目
        if station.project_id:
            order.project_id = station.project_id
            await db.flush()
            logger.info(f"订单 {order.order_no} 自动关联到项目 {station.project_id}")
            return True
        
        # 如果站点没有关联项目，尝试通过地址匹配
        if station.address:
            project_result = await db.execute(
                select(Project).where(
                    Project.address.ilike(f"%{station.address[:20]}%"),
                    Project.is_deleted == False
                ).limit(1)
            )
            project = project_result.scalar_one_or_none()
            if project:
                order.project_id = str(project.id)
                # 同时更新站点的project_id
                station.project_id = str(project.id)
                await db.flush()
                logger.info(f"订单 {order.order_no} 通过地址匹配关联到项目 {project.id}")
                return True
        
        return False
    
    async def batch_link_station_orders(self, db: AsyncSession, station_id: str) -> int:
        """批量关联站点的所有未关联订单"""
        from app.models.charging.models import ChargingOrder, ChargingStation
        
        # 获取站点的project_id
        station_result = await db.execute(
            select(ChargingStation.project_id).where(ChargingStation.id == station_id)
        )
        project_id = station_result.scalar()
        
        if not project_id:
            logger.warning(f"站点 {station_id} 未关联项目")
            return 0
        
        # 批量更新
        result = await db.execute(
            update(ChargingOrder)
            .where(
                ChargingOrder.station_id == station_id,
                ChargingOrder.project_id.is_(None)
            )
            .values(project_id=project_id)
        )
        
        count = result.rowcount
        if count > 0:
            logger.info(f"站点 {station_id} 批量关联了 {count} 个订单到项目 {project_id}")
        
        return count


# 全局实例
charging_auto_link = ChargingAutoLinkService()
