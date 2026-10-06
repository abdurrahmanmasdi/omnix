import uuid
import datetime
from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class OrganizationKnowledge(Base):
    __tablename__ = 'organization_knowledge' # Matches your @@map in Prisma

    # Ensure we use UUIDs matching Prisma's @db.Uuid
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organizationId = Column(UUID(as_uuid=True), index=True)
    file_name = Column(String)
    documentationId = Column(UUID(as_uuid=True), index=True)
    content = Column(Text)
    embedding = Column(Vector(3072)) # Flagship Precision: 3072 dimensions
    createdAt = Column(DateTime, default=datetime.datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class OrganizationExperience(Base):
    __tablename__ = 'organization_experiences'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organizationId = Column(UUID(as_uuid=True), index=True)
    title = Column(String)
    patientCountry = Column(String, nullable=True)
    procedureType = Column(String, nullable=True)
    storyText = Column(Text)
    beforeImageUrl = Column(String, nullable=True)
    afterImageUrl = Column(String, nullable=True)
    
    # The 3072-dimensional embedding vector
    embedding = Column(Vector(3072)) 
    
    createdAt = Column(DateTime, default=datetime.datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)