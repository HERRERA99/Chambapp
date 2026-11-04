export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      notas: {
        Row: {
          id: string;
          usuario_id: string;
          titulo: string;
          contenido_md: string;
          creado_en: string;
          actualizado_en: string;
          version: number;
          cifrado: string | null;
          boveda_generacion: string | null;
        };
        Insert: {
          id?: string;
          usuario_id?: string;
          titulo: string;
          contenido_md?: string;
          creado_en?: string;
          actualizado_en?: string;
          version?: number;
          cifrado?: string | null;
          boveda_generacion?: string | null;
        };
        Update: {
          id?: string;
          usuario_id?: string;
          titulo?: string;
          contenido_md?: string;
          creado_en?: string;
          actualizado_en?: string;
          version?: number;
          cifrado?: string | null;
          boveda_generacion?: string | null;
        };
        Relationships: [];
      };
      bovedas: {
        Row: {
          usuario_id: string;
          generacion: string;
          sal: string;
          iteraciones: number;
          clave_envuelta: string;
          creado_en: string;
          actualizado_en: string;
          version: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      credenciales: {
        Row: {
          id: string;
          usuario_id: string;
          proyecto_id: string;
          boveda_generacion: string;
          cifrado: string;
          creado_en: string;
          actualizado_en: string;
          version: number;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      nota_proyectos: {
        Row: { nota_id: string; proyecto_id: string; usuario_id: string };
        Insert: { nota_id: string; proyecto_id: string; usuario_id?: string };
        Update: { nota_id?: string; proyecto_id?: string; usuario_id?: string };
        Relationships: [];
      };
      nota_tareas: {
        Row: { nota_id: string; tarea_id: string; usuario_id: string };
        Insert: { nota_id: string; tarea_id: string; usuario_id?: string };
        Update: { nota_id?: string; tarea_id?: string; usuario_id?: string };
        Relationships: [];
      };
      ausencias: {
        Row: {
          id: string;
          usuario_id: string;
          titulo: string;
          tipo: 'festivo' | 'vacaciones';
          inicio: string;
          fin: string;
          fuente: 'manual' | 'nager';
          ambito: string | null;
          creado_en: string;
          actualizado_en: string;
          version: number;
        };
        Insert: {
          id?: string;
          usuario_id?: string;
          titulo: string;
          tipo: string;
          inicio: string;
          fin: string;
          fuente?: string;
          ambito?: string | null;
          creado_en?: string;
          actualizado_en?: string;
          version?: number;
        };
        Update: {
          id?: string;
          usuario_id?: string;
          titulo?: string;
          tipo?: string;
          inicio?: string;
          fin?: string;
          fuente?: string;
          ambito?: string | null;
          creado_en?: string;
          actualizado_en?: string;
          version?: number;
        };
        Relationships: [];
      };
      configuraciones_semanales: {
        Row: {
          creado_en: string;
          id: string;
          minutos_semanales: number;
          usuario_id: string;
          vigente_desde: string;
        };
        Insert: {
          creado_en?: string;
          id?: string;
          minutos_semanales: number;
          usuario_id: string;
          vigente_desde: string;
        };
        Update: {
          creado_en?: string;
          id?: string;
          minutos_semanales?: number;
          usuario_id?: string;
          vigente_desde?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'configuraciones_semanales_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      dias_configuracion_semanal: {
        Row: {
          configuracion_id: string;
          dia_semana: number;
          minutos_objetivo: number;
        };
        Insert: {
          configuracion_id: string;
          dia_semana: number;
          minutos_objetivo: number;
        };
        Update: {
          configuracion_id?: string;
          dia_semana?: number;
          minutos_objetivo?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'dias_configuracion_semanal_configuracion_id_fkey';
            columns: ['configuracion_id'];
            isOneToOne: false;
            referencedRelation: 'configuraciones_semanales';
            referencedColumns: ['id'];
          },
        ];
      };
      fichajes: {
        Row: {
          actualizado_en: string;
          creado_en: string;
          eliminado_en: string | null;
          fin_en: string | null;
          id: string;
          inicio_en: string;
          jornada_id: string;
          usuario_id: string;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          creado_en?: string;
          eliminado_en?: string | null;
          fin_en?: string | null;
          id: string;
          inicio_en: string;
          jornada_id: string;
          usuario_id: string;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          creado_en?: string;
          eliminado_en?: string | null;
          fin_en?: string | null;
          id?: string;
          inicio_en?: string;
          jornada_id?: string;
          usuario_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'fichajes_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'jornadas';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'fichajes_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_jornadas';
            referencedColumns: ['jornada_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'fichajes_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      jornadas: {
        Row: {
          actualizado_en: string;
          configuracion_id: string | null;
          creado_en: string;
          fecha: string;
          id: string;
          minutos_objetivo: number;
          notas: string | null;
          usuario_id: string;
          version: number;
          zona_horaria: string;
        };
        Insert: {
          actualizado_en?: string;
          configuracion_id?: string | null;
          creado_en?: string;
          fecha: string;
          id?: string;
          minutos_objetivo?: number;
          notas?: string | null;
          usuario_id: string;
          version?: number;
          zona_horaria: string;
        };
        Update: {
          actualizado_en?: string;
          configuracion_id?: string | null;
          creado_en?: string;
          fecha?: string;
          id?: string;
          minutos_objetivo?: number;
          notas?: string | null;
          usuario_id?: string;
          version?: number;
          zona_horaria?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'jornadas_configuracion_id_usuario_id_fkey';
            columns: ['configuracion_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'configuraciones_semanales';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'jornadas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      imputaciones_odoo: {
        Row: {
          creado_en: string;
          estado: string;
          id: string;
          jornada_id: string;
          tarea_id: string;
          usuario_id: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      partes_horas: {
        Row: {
          actualizado_en: string;
          creado_en: string;
          descripcion: string | null;
          eliminado_en: string | null;
          fin_en: string | null;
          id: string;
          imputacion_odoo_id: string | null;
          imputado_en_odoo: boolean;
          inicio_en: string;
          intervalo_redondeo_minutos: number;
          jornada_id: string;
          modo_redondeo: string;
          tarea_id: string;
          usuario_id: string;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          creado_en?: string;
          descripcion?: string | null;
          eliminado_en?: string | null;
          fin_en?: string | null;
          id?: string;
          imputacion_odoo_id?: string | null;
          imputado_en_odoo?: boolean;
          inicio_en: string;
          intervalo_redondeo_minutos: number;
          jornada_id: string;
          modo_redondeo?: string;
          tarea_id: string;
          usuario_id: string;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          creado_en?: string;
          descripcion?: string | null;
          eliminado_en?: string | null;
          fin_en?: string | null;
          id?: string;
          imputacion_odoo_id?: string | null;
          imputado_en_odoo?: boolean;
          inicio_en?: string;
          intervalo_redondeo_minutos?: number;
          jornada_id?: string;
          modo_redondeo?: string;
          tarea_id?: string;
          usuario_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'partes_horas_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'jornadas';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_jornadas';
            referencedColumns: ['jornada_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_tarea_id_usuario_id_fkey';
            columns: ['tarea_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_tareas';
            referencedColumns: ['tarea_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_tarea_id_usuario_id_fkey';
            columns: ['tarea_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'tareas';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      perfiles: {
        Row: {
          actualizado_en: string;
          creado_en: string;
          id: string;
          intervalo_redondeo_minutos: number;
          modo_redondeo: string;
          nombre: string;
          onboarding_completado: boolean;
          preferencias: Json;
          version: number;
          zona_horaria: string;
        };
        Insert: {
          actualizado_en?: string;
          creado_en?: string;
          id: string;
          intervalo_redondeo_minutos?: number;
          modo_redondeo?: string;
          nombre?: string;
          onboarding_completado?: boolean;
          preferencias?: Json;
          version?: number;
          zona_horaria?: string;
        };
        Update: {
          actualizado_en?: string;
          creado_en?: string;
          id?: string;
          intervalo_redondeo_minutos?: number;
          modo_redondeo?: string;
          nombre?: string;
          onboarding_completado?: boolean;
          preferencias?: Json;
          version?: number;
          zona_horaria?: string;
        };
        Relationships: [];
      };
      proyectos: {
        Row: {
          actualizado_en: string;
          archivado_en: string | null;
          cliente: string | null;
          creado_en: string;
          descripcion: string | null;
          eliminado_en: string | null;
          id: string;
          nombre: string;
          presupuesto_minutos: number | null;
          usuario_id: string;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          archivado_en?: string | null;
          cliente?: string | null;
          creado_en?: string;
          descripcion?: string | null;
          eliminado_en?: string | null;
          id?: string;
          nombre: string;
          presupuesto_minutos?: number | null;
          usuario_id: string;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          archivado_en?: string | null;
          cliente?: string | null;
          creado_en?: string;
          descripcion?: string | null;
          eliminado_en?: string | null;
          id?: string;
          nombre?: string;
          presupuesto_minutos?: number | null;
          usuario_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'proyectos_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      tareas: {
        Row: {
          actualizado_en: string;
          archivado_en: string | null;
          creado_en: string;
          descripcion: string | null;
          eliminado_en: string | null;
          estado: string;
          estimacion_minutos: number | null;
          id: string;
          odoo_id: string | null;
          odoo_url: string | null;
          proyecto_id: string;
          titulo: string;
          usuario_id: string;
          version: number;
        };
        Insert: {
          actualizado_en?: string;
          archivado_en?: string | null;
          creado_en?: string;
          descripcion?: string | null;
          eliminado_en?: string | null;
          estado?: string;
          estimacion_minutos?: number | null;
          id?: string;
          odoo_id?: string | null;
          odoo_url?: string | null;
          proyecto_id: string;
          titulo: string;
          usuario_id: string;
          version?: number;
        };
        Update: {
          actualizado_en?: string;
          archivado_en?: string | null;
          creado_en?: string;
          descripcion?: string | null;
          eliminado_en?: string | null;
          estado?: string;
          estimacion_minutos?: number | null;
          id?: string;
          odoo_id?: string | null;
          odoo_url?: string | null;
          proyecto_id?: string;
          titulo?: string;
          usuario_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tareas_proyecto_id_usuario_id_fkey';
            columns: ['proyecto_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'proyectos';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'tareas_proyecto_id_usuario_id_fkey';
            columns: ['proyecto_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_proyectos';
            referencedColumns: ['proyecto_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'tareas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      notas_detalle: {
        Row: {
          id: string | null;
          usuario_id: string | null;
          titulo: string | null;
          contenido_md: string | null;
          creado_en: string | null;
          actualizado_en: string | null;
          version: number | null;
          cifrado: string | null;
          boveda_generacion: string | null;
          proyecto_ids: string[] | null;
          tarea_ids: string[] | null;
        };
        Relationships: [];
      };
      credenciales_detalle: {
        Row: {
          id: string | null;
          usuario_id: string | null;
          proyecto_id: string | null;
          boveda_generacion: string | null;
          cifrado: string | null;
          creado_en: string | null;
          actualizado_en: string | null;
          version: number | null;
        };
        Relationships: [];
      };
      fichajes_detalle: {
        Row: {
          actualizado_en: string | null;
          creado_en: string | null;
          duracion_segundos: number | null;
          eliminado_en: string | null;
          fecha: string | null;
          fin_en: string | null;
          id: string | null;
          inicio_en: string | null;
          jornada_id: string | null;
          usuario_id: string | null;
          version: number | null;
          zona_horaria: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fichajes_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'jornadas';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'fichajes_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_jornadas';
            referencedColumns: ['jornada_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'fichajes_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      partes_detalle: {
        Row: {
          actualizado_en: string | null;
          creado_en: string | null;
          descripcion: string | null;
          duracion_imputada_segundos: number | null;
          duracion_real_segundos: number | null;
          eliminado_en: string | null;
          fecha: string | null;
          fin_en: string | null;
          fin_imputado_en: string | null;
          id: string | null;
          imputacion_odoo_id: string | null;
          imputado_en_odoo: boolean | null;
          inicio_en: string | null;
          inicio_imputado_en: string | null;
          intervalo_redondeo_minutos: number | null;
          jornada_id: string | null;
          modo_redondeo: string | null;
          odoo_id: string | null;
          odoo_url: string | null;
          proyecto_id: string | null;
          tarea_id: string | null;
          usuario_id: string | null;
          version: number | null;
          zona_horaria: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'partes_horas_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'jornadas';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_jornada_id_usuario_id_fkey';
            columns: ['jornada_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_jornadas';
            referencedColumns: ['jornada_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_tarea_id_usuario_id_fkey';
            columns: ['tarea_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_tareas';
            referencedColumns: ['tarea_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_tarea_id_usuario_id_fkey';
            columns: ['tarea_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'tareas';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'partes_horas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      resumen_jornadas: {
        Row: {
          fecha: string | null;
          jornada_id: string | null;
          minutos_objetivo: number | null;
          partes_en_curso: number | null;
          saldo_segundos: number | null;
          segundos_imputados: number | null;
          segundos_reales: number | null;
          usuario_id: string | null;
          zona_horaria: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'jornadas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      resumen_proyectos: {
        Row: {
          proyecto_id: string | null;
          segundos_imputados: number | null;
          segundos_reales: number | null;
          usuario_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'proyectos_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      resumen_semanas: {
        Row: {
          lunes: string | null;
          minutos_objetivo: number | null;
          saldo_segundos: number | null;
          segundos_imputados: number | null;
          segundos_reales: number | null;
          usuario_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'jornadas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
      resumen_tareas: {
        Row: {
          proyecto_id: string | null;
          segundos_imputados: number | null;
          segundos_reales: number | null;
          tarea_id: string | null;
          usuario_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tareas_proyecto_id_usuario_id_fkey';
            columns: ['proyecto_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'proyectos';
            referencedColumns: ['id', 'usuario_id'];
          },
          {
            foreignKeyName: 'tareas_proyecto_id_usuario_id_fkey';
            columns: ['proyecto_id', 'usuario_id'];
            isOneToOne: false;
            referencedRelation: 'resumen_proyectos';
            referencedColumns: ['proyecto_id', 'usuario_id'];
          },
          {
            foreignKeyName: 'tareas_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'perfiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      chambapp_notas: { Args: { p_accion: string; p_datos?: Json }; Returns: Json };
      chambapp_boveda: { Args: { p_accion: string; p_datos?: Json }; Returns: Json };
      chambapp_credenciales: { Args: { p_accion: string; p_datos?: Json }; Returns: Json };
      chambapp_calendario: { Args: { p_accion: string; p_datos?: Json }; Returns: Json };
      chambapp_imputaciones: { Args: { p_accion: string; p_datos?: Json }; Returns: Json };
      chambapp_configurar_odoo: {
        Args: { p_api_key?: string; p_guardar?: boolean };
        Returns: boolean;
      };
      chambapp_operar: {
        Args: { p_accion: string; p_datos?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
